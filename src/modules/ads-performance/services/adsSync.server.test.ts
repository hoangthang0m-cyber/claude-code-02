import { randomBytes } from "node:crypto"

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const { fx, insightsMock } = vi.hoisted(() => ({
  fx: {
    bindings: [] as Array<Record<string, unknown>>,
    item: { exists: true, project_id: "p1" },
    lifecycle: "running" as string,
    lastMetrics: [] as Array<Record<string, unknown>>,
    conn: { empty: false, state: "connected" } as {
      empty: boolean
      state: string
    },
    setSpy: vi.fn(),
  },
  insightsMock: {
    insights: {
      object_id: "o",
      spend: 200,
      messages: 8,
      purchases: 4,
      cost_per_purchase: 50,
      roas: 3,
      ctr: 1.2,
      ads_started_on: "2026-08-01",
    },
    status: "active" as string,
    fail: false,
  },
}))

vi.mock("@/lib/server/meta/insights", () => ({
  fetchAdObjectInsights: vi.fn(async (objectId: string) => {
    if (insightsMock.fail) throw new Error("meta down")
    return { ...insightsMock.insights, object_id: objectId }
  }),
  fetchDeliveryStatus: vi.fn(async () => insightsMock.status),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string) => ({
    where: () => query(name),
    limit: () => query(name),
    get: async () => {
      if (name === "adsBindings") {
        return { docs: fx.bindings.map((b, i) => ({ id: `b${i}`, data: () => b })) }
      }
      if (name === "adsMetrics") {
        return {
          docs: fx.lastMetrics.map((m, i) => ({ id: `m${i}`, data: () => m })),
        }
      }
      if (name === "adAccountConnections") {
        return fx.conn.empty
          ? { empty: true, docs: [] }
          : {
              empty: false,
              docs: [
                {
                  data: () => ({
                    state: fx.conn.state,
                    token_encrypted: encryptSecret("real-token"),
                  }),
                },
              ],
            }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name),
        doc: (id?: string) => ({
          id: id ?? "new-metric",
          get: async () => {
            if (name === "contentItems") {
              return {
                exists: fx.item.exists,
                data: () => ({ project_id: fx.item.project_id }),
              }
            }
            if (name === "projects") {
              return { exists: true, data: () => ({ lifecycle: fx.lifecycle }) }
            }
            return { exists: false }
          },
          set: fx.setSpy,
        }),
      }),
    }),
  }
})

import { encryptSecret } from "@/lib/server/crypto"
import {
  syncDueAdsMetrics,
  syncIntervalMs,
} from "@/modules/ads-performance/services/adsSync.server"

const NOW = 1_800_000_000_000
const HOUR = 3_600_000

beforeAll(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")
})

beforeEach(() => {
  fx.bindings = [
    { content_item_id: "c1", ad_account_id: "act1", object_id: "6001", active: true },
  ]
  fx.item = { exists: true, project_id: "p1" }
  fx.lifecycle = "running"
  fx.lastMetrics = []
  fx.conn = { empty: false, state: "connected" }
  fx.setSpy.mockReset().mockResolvedValue(undefined)
  insightsMock.status = "active"
  insightsMock.fail = false
})

describe("syncIntervalMs (SPEC §6.4 / Q5)", () => {
  it("running + active (or first run) → 6h", () => {
    expect(syncIntervalMs("running", "active")).toBe(6 * HOUR)
    expect(syncIntervalMs("running", null)).toBe(6 * HOUR)
  })
  it("running + paused/completed → 12h (giãn ra)", () => {
    expect(syncIntervalMs("running", "paused")).toBe(12 * HOUR)
    expect(syncIntervalMs("running", "completed")).toBe(12 * HOUR)
  })
  it("done → 24h", () => {
    expect(syncIntervalMs("done", "active")).toBe(24 * HOUR)
  })
})

describe("syncDueAdsMetrics (SPEC §5.4 R3)", () => {
  it("writes an AdsMetric source=synced with data_as_of for a due item", async () => {
    const summary = await syncDueAdsMetrics(NOW)
    expect(summary).toMatchObject({ items_scanned: 1, synced: 1 })

    const written = fx.setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(written).toMatchObject({
      content_item_id: "c1",
      source: "synced",
      spend: 200,
      messages: 8,
      cost_per_purchase: 50,
      delivery_status: "active",
    })
    expect(written.data_as_of).toBeDefined()
    expect(written.captured_at).toBeDefined()
  })

  it("skips an item synced within its interval (running+active → 6h)", async () => {
    fx.lastMetrics = [
      { source: "synced", delivery_status: "active", captured_at: { toMillis: () => NOW - 2 * HOUR } },
    ]
    const summary = await syncDueAdsMetrics(NOW)
    expect(summary).toMatchObject({ synced: 0, skipped_not_due: 1 })
    expect(fx.setSpy).not.toHaveBeenCalled()
  })

  it("a done project only syncs every 24h", async () => {
    fx.lifecycle = "done"
    fx.lastMetrics = [
      { source: "synced", delivery_status: "active", captured_at: { toMillis: () => NOW - 10 * HOUR } },
    ]
    expect((await syncDueAdsMetrics(NOW)).skipped_not_due).toBe(1)

    fx.lastMetrics = [
      { source: "synced", delivery_status: "active", captured_at: { toMillis: () => NOW - 25 * HOUR } },
    ]
    fx.setSpy.mockClear()
    expect((await syncDueAdsMetrics(NOW)).synced).toBe(1)
  })

  it("never syncs an archived project", async () => {
    fx.lifecycle = "archived"
    const summary = await syncDueAdsMetrics(NOW)
    expect(summary).toMatchObject({ synced: 0, skipped_archived: 1 })
    expect(fx.setSpy).not.toHaveBeenCalled()
  })

  it("skips bindings whose ad account needs reconnecting (SPEC §5.4 R1)", async () => {
    fx.conn = { empty: false, state: "needs_reconnect" }
    const summary = await syncDueAdsMetrics(NOW)
    expect(summary).toMatchObject({ synced: 0, skipped_no_account: 1 })
  })

  it("aggregates several active bindings into one AdsMetric", async () => {
    fx.bindings = [
      { content_item_id: "c1", ad_account_id: "act1", object_id: "6001", active: true },
      { content_item_id: "c1", ad_account_id: "act1", object_id: "6002", active: true },
    ]
    await syncDueAdsMetrics(NOW)
    expect(fx.setSpy).toHaveBeenCalledTimes(1)
    const written = fx.setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(written.spend).toBe(400) // 200 + 200
  })

  it("counts object errors and skips the item when every object fails", async () => {
    insightsMock.fail = true
    const summary = await syncDueAdsMetrics(NOW)
    expect(summary.object_errors).toBe(1)
    expect(summary.skipped_no_account).toBe(1)
    expect(fx.setSpy).not.toHaveBeenCalled()
  })
})
