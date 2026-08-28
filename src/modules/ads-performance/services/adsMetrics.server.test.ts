import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    itemExists: true,
    actorRole: "manager" as "manager" | "staff" | null,
    lifecycle: "running" as "running" | "done" | "archived" | null,
    rows: [] as Array<Record<string, unknown>>,
    setSpy: vi.fn(),
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string) => query(name, [...clauses, f]),
    limit: () => query(name, clauses),
    get: async () => {
      if (name === "projectMembers" && clauses.includes("user_id")) {
        return fx.actorRole == null
          ? { empty: true, docs: [] }
          : { empty: false, docs: [{ data: () => ({ project_role: fx.actorRole }) }] }
      }
      if (name === "adsMetrics") {
        return { docs: fx.rows.map((r, i) => ({ id: `m${i}`, data: () => r })) }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => ({
          id: id ?? "new-metric",
          get: async () => {
            if (name === "contentItems") {
              return { exists: fx.itemExists, data: () => ({ project_id: "p1" }) }
            }
            if (name === "projects") {
              return {
                exists: fx.lifecycle != null,
                data: () => ({ lifecycle: fx.lifecycle }),
              }
            }
            return { exists: false }
          },
          set: fx.setSpy,
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  enterManualMetric,
  getContentMetrics,
} from "@/modules/ads-performance/services/adsMetrics.server"

const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }
const row = (over: Record<string, unknown>) => ({
  source: "synced",
  spend: 0,
  messages: 0,
  cost_per_purchase: 0,
  roas: 0,
  ctr: 0,
  delivery_status: "active",
  ...over,
})

beforeEach(() => {
  fx.itemExists = true
  fx.actorRole = "manager"
  fx.lifecycle = "running"
  fx.rows = []
  fx.setSpy.mockReset().mockResolvedValue(undefined)
})

describe("enterManualMetric (SPEC §5.4 R4)", () => {
  it("403 for a non-manager", async () => {
    fx.actorRole = "staff"
    await expect(
      enterManualMetric(mgr, "c1", { roas: 3 })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("409 when the project is archived", async () => {
    fx.lifecycle = "archived"
    await expect(
      enterManualMetric(mgr, "c1", { roas: 3 })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("writes source=manual with a server captured_at + data_as_of", async () => {
    await enterManualMetric(mgr, "c1", {
      roas: 3.5,
      cost_per_purchase: 42000,
      messages: 11,
    })
    const w = fx.setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(w).toMatchObject({
      content_item_id: "c1",
      source: "manual",
      roas: 3.5,
      cost_per_purchase: 42000,
      messages: 11,
      spend: 0, // defaulted
    })
    expect(w.data_as_of).toBeDefined()
    expect(w.captured_at).toBeDefined()
  })
})

describe("getContentMetrics — priority synced > manual (SPEC §6.1, §5.4 R4)", () => {
  it("403 for a non-member", async () => {
    fx.actorRole = null
    await expect(getContentMetrics(mgr, "c1")).rejects.toMatchObject({
      status: 403,
    })
  })

  it("no rows → current null, source null", async () => {
    const r = await getContentMetrics(mgr, "c1")
    expect(r.current).toBeNull()
    expect(r.source).toBeNull()
  })

  it("only manual rows → latest manual is current", async () => {
    fx.rows = [
      row({ source: "manual", roas: 2, captured_at: { toMillis: () => 100 } }),
      row({ source: "manual", roas: 4, captured_at: { toMillis: () => 300 } }),
    ]
    const r = await getContentMetrics(mgr, "c1")
    expect(r.source).toBe("manual")
    expect(r.current?.roas).toBe(4)
  })

  it("any synced row wins over a more recent manual row", async () => {
    fx.rows = [
      row({ source: "synced", roas: 2, captured_at: { toMillis: () => 100 } }),
      row({ source: "manual", roas: 9, captured_at: { toMillis: () => 500 } }),
    ]
    const r = await getContentMetrics(mgr, "c1")
    expect(r.source).toBe("synced")
    expect(r.current?.roas).toBe(2)
  })

  it("picks the latest synced row among several", async () => {
    fx.rows = [
      row({ source: "synced", roas: 1, captured_at: { toMillis: () => 100 } }),
      row({ source: "synced", roas: 3, captured_at: { toMillis: () => 400 } }),
      row({ source: "synced", roas: 2, captured_at: { toMillis: () => 250 } }),
    ]
    expect((await getContentMetrics(mgr, "c1")).current?.roas).toBe(3)
  })

  it("history keeps every row, newest first", async () => {
    fx.rows = [
      row({ source: "manual", captured_at: { toMillis: () => 100 } }),
      row({ source: "synced", captured_at: { toMillis: () => 300 } }),
      row({ source: "manual", captured_at: { toMillis: () => 200 } }),
    ]
    const r = await getContentMetrics(mgr, "c1")
    expect(r.history).toHaveLength(3)
    expect(r.history.map((h) => h.captured_at)).toEqual([300, 200, 100])
  })
})
