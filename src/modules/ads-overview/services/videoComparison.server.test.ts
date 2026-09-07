import { beforeEach, describe, expect, it, vi } from "vitest"

type Doc = Record<string, unknown>
const store = new Map<string, Map<string, Doc>>()
const col = (n: string) => {
  if (!store.has(n)) store.set(n, new Map())
  return store.get(n)!
}
type Filter = [string, string, unknown]
const matches = (d: Doc, fs: Filter[]) =>
  fs.every(([f, op, v]) => {
    const x = d[f]
    if (op === "==") return x === v
    if (op === "in") return Array.isArray(v) && v.includes(x)
    if (op === ">=") return String(x) >= String(v)
    if (op === "<=") return String(x) <= String(v)
    return true
  })
function q(name: string, fs: Filter[]) {
  return {
    where: (f: string, o: string, v: unknown) => q(name, [...fs, [f, o, v]]),
    limit: () => q(name, fs),
    get: async () => {
      const docs = [...col(name).entries()]
        .filter(([, d]) => matches(d, fs))
        .map(([id, d]) => ({ id, data: () => d }))
      return { docs, empty: docs.length === 0, size: docs.length }
    },
  }
}
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: (name: string) => ({
      ...q(name, []),
      doc: (id: string) => ({
        id,
        get: async () => ({ exists: col(name).has(id), data: () => col(name).get(id) }),
      }),
    }),
  }),
}))

import type { AuthedUser } from "@/lib/server/auth"
import { getVideoComparison } from "@/modules/ads-overview/services/videoComparison.server"

const manager: AuthedUser = { uid: "m", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "s", email: null, system_role: "staff" }
const p = (s: string) => new URLSearchParams(s)

beforeEach(() => {
  store.clear()
  col("reportingSettings").set("default", { reporting_currency: "VND" })
  col("contentItems").set("ci1", { code: "V1" })
  col("contentItems").set("ci2", { code: "V2" })
})

describe("getVideoComparison (tasks 6.2 / 6.3 / 6.7)", () => {
  it("rejects staff", async () => {
    await expect(
      getVideoComparison(staff, p("items=ci1&period=month&date=2026-06-15"))
    ).rejects.toMatchObject({ status: 403 })
  })

  it("rejects more than 6 items", async () => {
    await expect(
      getVideoComparison(
        manager,
        p("items=a,b,c,d,e,f,g&period=month&date=2026-06-15")
      )
    ).rejects.toMatchObject({ status: 400 })
  })

  it("aggregates a video's ad snapshots and marks a not-yet-synced one pending", async () => {
    col("adsBindings").set("b1", {
      content_item_id: "ci1",
      ad_account_id: "acc",
      object_level: "ad",
      object_id: "ad_9",
      active: true,
    })
    col("adsBindings").set("b2", {
      content_item_id: "ci2",
      ad_account_id: "acc",
      object_level: "ad",
      object_id: "ad_x",
      active: true,
    })
    col("adCreativeInsightSnapshots").set("s1", {
      ad_account_id: "acc",
      ad_id: "ad_9",
      stat_date: "2026-06-05",
      spend: 100,
      revenue: 300,
      purchases: 2,
      video_plays: 1000,
      video_3s_plays: 600,
      video_p100_plays: 150,
      account_currency: "VND",
    })

    const r = await getVideoComparison(
      manager,
      p("items=ci1,ci2&period=month&date=2026-06-15")
    )
    const v1 = r.items.find((x) => x.content_item_id === "ci1")!
    expect(v1.status).toBe("ok")
    expect(v1.metrics.roas).toBeCloseTo(3)
    expect(v1.metrics.hook_rate).toBeCloseTo(0.6)
    const v2 = r.items.find((x) => x.content_item_id === "ci2")!
    expect(v2.status).toBe("pending")
  })

  it("only shows the requested extra metric columns", async () => {
    col("adsBindings").set("b1", {
      content_item_id: "ci1",
      ad_account_id: "acc",
      object_level: "ad",
      object_id: "ad_9",
      active: true,
    })
    const r = await getVideoComparison(
      manager,
      p("items=ci1&period=month&date=2026-06-15&metrics=ctr,spend")
    )
    expect(r.metrics_shown).toEqual([
      "cost_per_purchase",
      "roas",
      "hook_rate",
      "retention_rate",
      "ctr",
      "spend",
    ])
  })
})
