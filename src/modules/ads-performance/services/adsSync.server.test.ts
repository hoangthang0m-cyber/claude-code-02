import { randomBytes } from "node:crypto"

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { MetaGraphError } from "@/lib/server/meta/errors"

const { fx, insightsMock } = vi.hoisted(() => ({
  fx: {
    bindings: [] as Array<{ data: Record<string, unknown>; update: ReturnType<typeof vi.fn> }>,
    item: { exists: true, project_id: "p1" },
    lifecycle: "running" as string,
    lastMetrics: [] as Array<Record<string, unknown>>,
    conn: { empty: false, state: "connected" } as { empty: boolean; state: string },
    connUpdate: vi.fn(),
    managerUids: ["u-mgr"] as string[],
    batchSet: vi.fn(),
    batchCommit: vi.fn(),
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
    // a queue of behaviours: "ok" | MetaGraphError instances, consumed per call pair
    script: [] as Array<"ok" | Error>,
  },
}))

vi.mock("@/lib/server/meta/insights", () => {
  const next = () => {
    const step = insightsMock.script.length ? insightsMock.script.shift()! : "ok"
    if (step !== "ok") throw step
  }
  return {
    fetchAdObjectInsights: vi.fn(async (objectId: string) => {
      next()
      return { ...insightsMock.insights, object_id: objectId }
    }),
    fetchDeliveryStatus: vi.fn(async () => insightsMock.status),
  }
})

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string) => ({
    where: () => query(name),
    limit: () => query(name),
    get: async () => {
      if (name === "adsBindings") {
        return {
          docs: fx.bindings.map((b, i) => ({
            id: `b${i}`,
            data: () => b.data,
            ref: { update: b.update },
          })),
        }
      }
      if (name === "adsMetrics") {
        return { docs: fx.lastMetrics.map((m, i) => ({ id: `m${i}`, data: () => m })) }
      }
      if (name === "projectMembers") {
        return { docs: fx.managerUids.map((u) => ({ data: () => ({ user_id: u }) })) }
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
                  ref: { update: fx.connUpdate },
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
      batch: () => ({ set: fx.batchSet, commit: fx.batchCommit }),
      collection: (name: string) => ({
        ...query(name),
        doc: (id?: string) => ({
          id: id ?? "new-metric",
          get: async () => {
            if (name === "contentItems") {
              return {
                exists: fx.item.exists,
                data: () => ({
                  project_id: fx.item.project_id,
                  code: "V-CODE",
                }),
              }
            }
            if (name === "projects") {
              return { exists: true, data: () => ({ lifecycle: fx.lifecycle }) }
            }
            return { exists: false }
          },
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
const OPTS = { retryBaseMs: 0 }

const binding = (over: Record<string, unknown> = {}) => ({
  data: {
    content_item_id: "c1",
    ad_account_id: "act1",
    object_id: "6001",
    active: true,
    ...over,
  },
  update: vi.fn().mockResolvedValue(undefined),
})

beforeAll(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")
})

beforeEach(() => {
  fx.bindings = [binding()]
  fx.item = { exists: true, project_id: "p1" }
  fx.lifecycle = "running"
  fx.lastMetrics = []
  fx.conn = { empty: false, state: "connected" }
  fx.connUpdate.mockReset().mockResolvedValue(undefined)
  fx.managerUids = ["u-mgr"]
  fx.batchSet.mockReset()
  fx.batchCommit.mockReset().mockResolvedValue(undefined)
  insightsMock.status = "active"
  insightsMock.script = []
})

// batch.set(ref, data) → the AdsMetric doc is the first set call's 2nd arg
const metricWrite = () => fx.batchSet.mock.calls[0]?.[1] as Record<string, unknown>
const notifications = () =>
  fx.batchSet.mock.calls.slice(1).map((c) => c[1] as Record<string, unknown>)

describe("syncIntervalMs (SPEC §6.4 / Q5)", () => {
  it("running active → 6h, running paused → 12h, done → 24h", () => {
    expect(syncIntervalMs("running", "active")).toBe(6 * HOUR)
    expect(syncIntervalMs("running", null)).toBe(6 * HOUR)
    expect(syncIntervalMs("running", "paused")).toBe(12 * HOUR)
    expect(syncIntervalMs("done", "active")).toBe(24 * HOUR)
  })
})

describe("syncDueAdsMetrics — happy path (SPEC §5.4 R3)", () => {
  it("writes an AdsMetric source=synced with data_as_of", async () => {
    const s = await syncDueAdsMetrics(NOW, OPTS)
    expect(s).toMatchObject({ items_scanned: 1, synced: 1 })
    expect(metricWrite()).toMatchObject({
      source: "synced",
      spend: 200,
      delivery_status: "active",
    })
    expect(metricWrite().data_as_of).toBeDefined()
    expect(fx.batchCommit).toHaveBeenCalled()
  })

  it("skips an item within its interval", async () => {
    fx.lastMetrics = [
      { source: "synced", delivery_status: "active", captured_at: { toMillis: () => NOW - 2 * HOUR } },
    ]
    expect((await syncDueAdsMetrics(NOW, OPTS)).skipped_not_due).toBe(1)
    expect(fx.batchSet).not.toHaveBeenCalled()
  })

  it("done project → 24h cadence", async () => {
    fx.lifecycle = "done"
    fx.lastMetrics = [
      { source: "synced", delivery_status: "active", captured_at: { toMillis: () => NOW - 10 * HOUR } },
    ]
    expect((await syncDueAdsMetrics(NOW, OPTS)).skipped_not_due).toBe(1)
  })

  it("never syncs an archived project", async () => {
    fx.lifecycle = "archived"
    expect((await syncDueAdsMetrics(NOW, OPTS)).skipped_archived).toBe(1)
    expect(fx.batchSet).not.toHaveBeenCalled()
  })

  it("aggregates several bindings into one AdsMetric", async () => {
    fx.bindings = [binding(), binding({ object_id: "6002" })]
    await syncDueAdsMetrics(NOW, OPTS)
    expect(fx.batchSet).toHaveBeenCalledTimes(1)
    expect((metricWrite() as { spend: number }).spend).toBe(400)
  })
})

describe("syncDueAdsMetrics — ads stopped (SPEC §5.4 R3 / §5.7 R1, task 5.7)", () => {
  const wasActive = {
    source: "synced",
    delivery_status: "active",
    captured_at: { toMillis: () => NOW - 20 * HOUR },
  }

  it("active → paused notifies every project manager", async () => {
    fx.lastMetrics = [wasActive]
    insightsMock.status = "paused"
    fx.managerUids = ["u-mgr-1", "u-mgr-2"]

    const s = await syncDueAdsMetrics(NOW, OPTS)
    expect(s.ads_stopped_events).toBe(1)
    expect(s.synced).toBe(1)

    const n = notifications()
    expect(n).toHaveLength(2)
    expect(n[0]).toMatchObject({
      recipient_id: "u-mgr-1",
      type: "ads_stopped",
      content_item_id: "c1",
    })
    expect(n[0].message).toContain("tạm dừng")
  })

  it("active → completed notifies with 'hoàn tất'", async () => {
    fx.lastMetrics = [wasActive]
    insightsMock.status = "completed"
    const s = await syncDueAdsMetrics(NOW, OPTS)
    expect(s.ads_stopped_events).toBe(1)
    expect(notifications()[0].message).toContain("hoàn tất")
  })

  it("active → active does not notify", async () => {
    fx.lastMetrics = [wasActive]
    insightsMock.status = "active"
    const s = await syncDueAdsMetrics(NOW, OPTS)
    expect(s.ads_stopped_events).toBe(0)
    expect(notifications()).toHaveLength(0)
  })

  it("paused → paused does not notify (already stopped)", async () => {
    fx.lastMetrics = [
      { source: "synced", delivery_status: "paused", captured_at: { toMillis: () => NOW - 20 * HOUR } },
    ]
    insightsMock.status = "paused"
    const s = await syncDueAdsMetrics(NOW, OPTS)
    expect(s.ads_stopped_events).toBe(0)
  })

  it("first sync (no prior metric) does not notify even if paused", async () => {
    fx.lastMetrics = []
    insightsMock.status = "paused"
    const s = await syncDueAdsMetrics(NOW, OPTS)
    expect(s.synced).toBe(1)
    expect(s.ads_stopped_events).toBe(0)
  })
})

describe("syncDueAdsMetrics — error handling (SPEC §5.4 R3, task 5.6)", () => {
  const rateLimit = () => new MetaGraphError("rate_limit", "slow down", 4)
  const network = () => new MetaGraphError("transient", "ECONNRESET")

  it("retries a rate-limit error, then keeps last data + stamps sync_error_since", async () => {
    insightsMock.script = [rateLimit(), rateLimit(), rateLimit()]
    const s = await syncDueAdsMetrics(NOW, OPTS)

    expect(s.retries).toBe(2) // 2 backoffs before the 3rd attempt
    expect(s.object_errors).toBe(1)
    expect(s.bindings_erroring).toBe(1)
    expect(s.synced).toBe(0)
    expect(fx.batchSet).not.toHaveBeenCalled() // last AdsMetric kept
    expect(fx.bindings[0].update).toHaveBeenCalledWith(
      expect.objectContaining({ sync_error_since: expect.anything() })
    )
  })

  it("retries a network error the same way", async () => {
    insightsMock.script = [network(), network(), network()]
    const s = await syncDueAdsMetrics(NOW, OPTS)
    expect(s.retries).toBe(2)
    expect(s.object_errors).toBe(1)
  })

  it("recovers on a retry → writes the metric and clears sync_error_since", async () => {
    insightsMock.script = [rateLimit(), "ok"]
    fx.bindings = [binding({ sync_error_since: { toMillis: () => NOW - HOUR } })]
    const s = await syncDueAdsMetrics(NOW, OPTS)

    expect(s.retries).toBe(1)
    expect(s.synced).toBe(1)
    expect(fx.bindings[0].update).toHaveBeenCalledWith({ sync_error_since: null })
  })

  it("a dead token disables the whole account and does not retry", async () => {
    insightsMock.script = [new MetaGraphError("auth", "token expired", 190)]
    const s = await syncDueAdsMetrics(NOW, OPTS)

    expect(s.retries).toBe(0)
    expect(s.accounts_disabled).toBe(1)
    expect(fx.connUpdate).toHaveBeenCalledWith({ state: "needs_reconnect" })
    expect(s.skipped_no_account).toBe(1)
  })

  it("a plain 4xx (fatal) is not retried", async () => {
    insightsMock.script = [new MetaGraphError("fatal", "unknown object", 100)]
    const s = await syncDueAdsMetrics(NOW, OPTS)
    expect(s.retries).toBe(0)
    expect(s.object_errors).toBe(1)
  })

  it("flags a binding that has been failing for more than 24h", async () => {
    insightsMock.script = [rateLimit(), rateLimit(), rateLimit()]
    fx.bindings = [
      binding({ sync_error_since: { toMillis: () => NOW - 25 * HOUR } }),
    ]
    const s = await syncDueAdsMetrics(NOW, OPTS)
    expect(s.bindings_stale_over_24h).toBe(1)
    // does not re-stamp the timestamp
    expect(fx.bindings[0].update).not.toHaveBeenCalled()
  })
})
