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
    if (op === ">=") return String(x) >= String(v)
    if (op === "<=") return String(x) <= String(v)
    return false
  })

const query = (name: string, fs: Filter[]) => ({
  where: (f: string, o: string, v: unknown) => query(name, [...fs, [f, o, v]]),
  limit: () => query(name, fs),
  orderBy: () => query(name, fs),
  get: async () => {
    const docs = [...col(name).entries()]
      .filter(([, d]) => matches(d, fs))
      .map(([id, d]) => ({ id, data: () => d, exists: true }))
    return { docs, empty: docs.length === 0, size: docs.length }
  },
})

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: (name: string) => ({
      ...query(name, []),
      doc: (id: string) => ({
        id,
        get: async () => ({
          exists: col(name).has(id),
          data: () => col(name).get(id),
        }),
      }),
    }),
  }),
  getAdminAuth: () => ({}),
}))

import type { AuthedUser } from "@/lib/server/auth"
import { getUnclassifiedGroup } from "@/modules/ads-overview/services/unclassifiedGroup.server"

const manager: AuthedUser = { uid: "m", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "s", email: null, system_role: "staff" }
const p = (s: string) => new URLSearchParams(s)

beforeEach(() => {
  store.clear()
  col("products").set("a", { code: "a", name: "AMHD", keywords: [] })
  col("productAccountRules").set("mapped__a", {
    ad_account_id: "mapped",
    product_id: "a",
    is_account_default: true,
  })
  col("reportingSettings").set("default", { reporting_currency: "VND" })
  // June 2026: one orphan-account campaign (unclassified) + one mapped campaign
  col("adsInsightSnapshots").set("s1", {
    ad_account_id: "orphan",
    campaign_id: "c1",
    campaign_name: "video 1",
    stat_date: "2026-06-10",
    spend: 100,
    revenue: 300,
    account_currency: "VND",
  })
  col("adsInsightSnapshots").set("s2", {
    ad_account_id: "mapped",
    campaign_id: "c2",
    campaign_name: "video 2",
    stat_date: "2026-06-12",
    spend: 999,
    revenue: 999,
    account_currency: "VND",
  })
  // outside the window
  col("adsInsightSnapshots").set("s3", {
    ad_account_id: "orphan",
    campaign_id: "c1",
    campaign_name: "video 1",
    stat_date: "2026-05-30",
    spend: 50,
    revenue: 0,
    account_currency: "VND",
  })
})

describe("getUnclassifiedGroup (task 2.6)", () => {
  it("rejects a staff account", async () => {
    await expect(
      getUnclassifiedGroup(staff, p("period=month&date=2026-06-15"))
    ).rejects.toMatchObject({ status: 403 })
  })

  it("returns only the orphan-account campaign inside the window", async () => {
    const r = await getUnclassifiedGroup(manager, p("period=month&date=2026-06-15"))
    expect(r.campaign_count).toBe(1)
    expect(r.spend).toBe(100)
    expect(r.revenue).toBe(300)
    expect(r.reporting_currency).toBe("VND")
    expect(r.window).toMatchObject({ from: "2026-06-01", to: "2026-06-30" })
  })
})
