import { beforeEach, describe, expect, it, vi } from "vitest"

// ads-overview-reporting group 7: end-to-end checks over the seed shape from
// design.md Decision 2 — 4 ad accounts, 3 products.
//   AMHD - Backup / AMHD-Backup 2  → product a (default)
//   Độ - Hẻm TBĐM  / Ha Phuong     → products t (default) + h

// ── in-memory Firestore ─────────────────────────────────────────────────

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
function query(name: string, fs: Filter[]) {
  return {
    where: (f: string, o: string, v: unknown) => query(name, [...fs, [f, o, v]]),
    orderBy: () => query(name, fs),
    limit: () => query(name, fs),
    get: async () => {
      const docs = [...col(name).entries()]
        .filter(([, d]) => matches(d, fs))
        .map(([id, d]) => ({ id, ref: ref(name, id), data: () => d }))
      return { docs, empty: docs.length === 0, size: docs.length }
    },
  }
}
function ref(name: string, id: string) {
  return {
    id,
    get name() {
      return name
    },
    get: async () => ({ exists: col(name).has(id), id, data: () => col(name).get(id) }),
    set: async (d: Doc, o?: { merge?: boolean }) =>
      void col(name).set(id, o?.merge ? { ...(col(name).get(id) ?? {}), ...d } : d),
    update: async (d: Doc) =>
      void col(name).set(id, { ...(col(name).get(id) ?? {}), ...d }),
    delete: async () => void col(name).delete(id),
  }
}
const fakeDb = {
  collection: (name: string) => ({ ...query(name, []), doc: (id: string) => ref(name, id) }),
  batch: () => {
    const ops: Array<() => void> = []
    return {
      set: (r: { name: string; id: string }, d: Doc) =>
        ops.push(() => col(r.name).set(r.id, d)),
      commit: async () => ops.forEach((f) => f()),
    }
  },
}

vi.mock("@/lib/server/firebaseAdmin", () => ({ getAdminDb: () => fakeDb }))
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (s: string) => `dec:${s}` }))
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__ts__" },
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
}))

import type { AuthedUser } from "@/lib/server/auth"
import { getProductReport } from "@/modules/ads-overview/services/productReport.server"
import { getVideoComparison } from "@/modules/ads-overview/services/videoComparison.server"
import { getProductConfig, setCampaignOverride } from "@/modules/ads-overview/services/productConfig.server"
import { getUnclassifiedGroup } from "@/modules/ads-overview/services/unclassifiedGroup.server"
import { syncCampaignSnapshots } from "@/modules/ads-overview/services/reportSync.server"

const manager: AuthedUser = { uid: "m", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "s", email: null, system_role: "staff" }
const p = (s: string) => new URLSearchParams(s)

function seedConfig() {
  col("products").set("a", { code: "a", name: "An Mệnh Hòa Duyên", keywords: [] })
  col("products").set("t", { code: "t", name: "Tứ Bản Định Mệnh", keywords: [] })
  col("products").set("h", { code: "h", name: "Hiếu Mệnh Dưỡng Con", keywords: ["hmdc"] })
  for (const acc of ["amhd1", "amhd2"]) {
    col("productAccountRules").set(`${acc}__a`, {
      ad_account_id: acc,
      product_id: "a",
      is_account_default: true,
    })
  }
  for (const acc of ["do", "haphuong"]) {
    col("productAccountRules").set(`${acc}__t`, {
      ad_account_id: acc,
      product_id: "t",
      is_account_default: true,
    })
    col("productAccountRules").set(`${acc}__h`, {
      ad_account_id: acc,
      product_id: "h",
      is_account_default: false,
    })
  }
  col("reportingSettings").set("default", { reporting_currency: "VND" })
  for (const [id, name] of [
    ["amhd1", "AMHD - Backup"],
    ["amhd2", "AMHD-Backup 2"],
    ["do", "Độ - Hẻm TBĐM"],
    ["haphuong", "Ha Phuong"],
  ]) {
    col("adAccountConnections").set(`m__${id}`, {
      project_owner_id: "m",
      ad_account_id: id,
      name,
      token_encrypted: "enc",
      state: "connected",
    })
  }
}

// campaign-day snapshot in June 2026
function snap(id: string, o: Partial<Doc>) {
  col("adsInsightSnapshots").set(id, {
    ad_account_id: "amhd1",
    campaign_id: "c",
    campaign_name: "camp",
    stat_date: "2026-06-10",
    spend: 0,
    revenue: 0,
    account_currency: "VND",
    ...o,
  })
}

beforeEach(() => {
  store.clear()
  seedConfig()
})

// ── 7.1 classification across the 4 accounts ────────────────────────────

describe("7.1 classification", () => {
  it("routes campaigns by code / keyword / account default / override", async () => {
    snap("s1", { ad_account_id: "amhd1", campaign_id: "a1", campaign_name: "chiến dịch tháng 6", spend: 10 }) // no code → AMHD default a
    snap("s2", { ad_account_id: "do", campaign_id: "t1", campaign_name: "thắng - T(1/6)", spend: 10 }) // code t
    snap("s3", { ad_account_id: "haphuong", campaign_id: "h1", campaign_name: "video HMDC mới", spend: 10 }) // keyword hmdc → h
    snap("s4", { ad_account_id: "haphuong", campaign_id: "x1", campaign_name: "video không mã", spend: 10 }) // shared default t
    snap("s5", { ad_account_id: "orphan", campaign_id: "o1", campaign_name: "video", spend: 10 }) // unconfigured

    const r = await getProductReport(manager, p("period=month&date=2026-06-15"))
    const by = Object.fromEntries(r.products.map((x) => [x.code, x.campaign_count]))
    expect(by).toEqual({ a: 1, t: 2, h: 1 }) // t = t1 + x1
    expect(r.unclassified.campaign_count).toBe(1) // o1
  })

  it("a config change re-classifies on the next read with no re-sync", async () => {
    snap("s1", { ad_account_id: "do", campaign_id: "c1", campaign_name: "thắng - T(1/6)", spend: 10 })
    let r = await getProductReport(manager, p("period=month&date=2026-06-15"))
    expect(r.products.find((x) => x.code === "t")!.campaign_count).toBe(1)

    // pin c1 to product a
    await setCampaignOverride(manager, { ad_account_id: "do", campaign_id: "c1", product_id: "a" })

    r = await getProductReport(manager, p("period=month&date=2026-06-15"))
    expect(r.products.find((x) => x.code === "t")!.campaign_count).toBe(0)
    expect(r.products.find((x) => x.code === "a")!.campaign_count).toBe(1)
  })
})

// ── 7.2 aggregation ────────────────────────────────────────────────────

describe("7.2 aggregation", () => {
  it("the 3-product total is the sum of the products and excludes 'Chưa phân loại'", async () => {
    snap("s1", { ad_account_id: "amhd1", campaign_id: "a1", spend: 100, revenue: 250 })
    snap("s2", { ad_account_id: "do", campaign_id: "t1", campaign_name: "T(1/6)", spend: 40, revenue: 40 })
    snap("s3", { ad_account_id: "orphan", campaign_id: "o1", spend: 999, revenue: 999 })

    const r = await getProductReport(manager, p("period=month&date=2026-06-15"))
    const sumSpend = r.products.reduce((n, x) => n + x.spend, 0)
    expect(r.total.spend).toBe(sumSpend)
    expect(r.total.spend).toBe(140) // 100 + 40, not the orphan 999
    expect(r.unclassified.spend).toBe(999)

    const u = await getUnclassifiedGroup(manager, p("period=month&date=2026-06-15"))
    expect(u).toMatchObject({ campaign_count: 1, spend: 999 })
  })
})

// ── 7.3 conversion window (a past day changes → report follows) ─────────

describe("7.3 conversion window", () => {
  const NOW = Date.parse("2026-06-15T09:00:00Z") // yesterday 2026-06-14
  let spendForDay = "1000"
  const jsonRes = (b: unknown, ok = true, status = 200) =>
    ({ ok, status, json: async () => b }) as Response
  const fetchImpl = vi.fn(async (u: string) => {
    const url = new URL(u)
    if (url.searchParams.get("level") === "campaign") {
      const tr = JSON.parse(url.searchParams.get("time_range")!)
      return jsonRes({
        data: [
          {
            campaign_id: "a1",
            campaign_name: "chiến dịch",
            date_start: tr.since,
            spend: spendForDay,
            actions: [],
            action_values: [],
          },
        ],
      })
    }
    if (url.pathname.match(/\/act_[^/]+$/)) return jsonRes({ currency: "VND" })
    return jsonRes({ data: [] })
  })

  it("re-syncs the last 7 days so a revised past-day figure flows into the report", async () => {
    // isolate to one account so the others don't backfill into the same total
    for (const id of ["amhd2", "do", "haphuong"]) {
      col("adAccountConnections").delete(`m__${id}`)
    }
    // pretend a prior sync already ran up to 2026-06-14
    col("adAccountReportSyncStates").set("amhd1__campaign", {
      ad_account_id: "amhd1",
      scope: "campaign",
      latest_synced_date: "2026-06-14",
      last_full_sync_at: { toMillis: () => NOW - 2 * 86_400_000 },
      last_result: "ok",
    })

    spendForDay = "1000"
    await syncCampaignSnapshots(NOW, { retryBaseMs: 0, fetchImpl: fetchImpl as never })
    let r = await getProductReport(manager, p("period=month&date=2026-06-14"))
    expect(r.products.find((x) => x.code === "a")!.spend).toBe(1000)

    // Meta revises that day
    spendForDay = "1750"
    await syncCampaignSnapshots(NOW, { retryBaseMs: 0, fetchImpl: fetchImpl as never })
    r = await getProductReport(manager, p("period=month&date=2026-06-14"))
    expect(r.products.find((x) => x.code === "a")!.spend).toBe(1750)
  })
})

// ── 7.4 multi-currency ─────────────────────────────────────────────────

describe("7.4 multi-currency", () => {
  it("an account with a rate is converted; one without is dropped and counted", async () => {
    col("currencyRates").set("USD__VND__2026-01-01", {
      from_currency: "USD",
      to_currency: "VND",
      rate: 25_000,
      effective_from: "2026-01-01",
    })
    snap("s1", { ad_account_id: "amhd1", campaign_id: "a1", account_currency: "USD", spend: 2, revenue: 6 })
    snap("s2", { ad_account_id: "amhd2", campaign_id: "a2", account_currency: "EUR", spend: 5, revenue: 5 })

    const r = await getProductReport(manager, p("period=month&date=2026-06-15"))
    expect(r.products.find((x) => x.code === "a")!.spend).toBe(50_000) // only the USD one
    expect(r.accounts_missing_rate).toEqual(["amhd2"])
    // freshness N/M: 4 connected, 1 dropped for rate
    expect(r.freshness.accounts_total).toBe(4)
    expect(r.freshness.accounts_merged).toBe(3)
  })
})

// ── 7.5 video comparison ───────────────────────────────────────────────

describe("7.5 video comparison", () => {
  beforeEach(() => {
    col("contentItems").set("ci1", { code: "V1" })
    col("adsBindings").set("b1", {
      content_item_id: "ci1",
      ad_account_id: "amhd1",
      object_level: "ad",
      object_id: "adA",
      active: true,
    })
    col("adsBindings").set("b2", {
      content_item_id: "ci1",
      ad_account_id: "amhd1",
      object_level: "ad",
      object_id: "adB",
      active: true,
    })
    col("adCreativeInsightSnapshots").set("v1", {
      ad_account_id: "amhd1",
      ad_id: "adA",
      stat_date: "2026-06-05",
      spend: 100,
      revenue: 300,
      purchases: 2,
      video_plays: 6000,
      video_3s_plays: 3600,
      video_p100_plays: 900,
      account_currency: "VND",
    })
    col("adCreativeInsightSnapshots").set("v2", {
      ad_account_id: "amhd1",
      ad_id: "adB",
      stat_date: "2026-06-06",
      spend: 100,
      revenue: 100,
      purchases: 0,
      video_plays: 4000,
      video_3s_plays: 2400,
      video_p100_plays: 600,
      account_currency: "VND",
    })
  })

  it("sums a video's two ads then computes hook rate / retention on the totals", async () => {
    const r = await getVideoComparison(manager, p("items=ci1&period=month&date=2026-06-15"))
    const v = r.items[0]
    expect(v.status).toBe("ok")
    // Σplays 10000, Σ3s 6000, Σp100 1500 → 60% / 25%
    expect(v.metrics.hook_rate).toBeCloseTo(0.6)
    expect(v.metrics.retention_rate).toBeCloseTo(0.25)
    expect(v.metrics.roas).toBeCloseTo(2) // 400 / 200
    expect(v.metrics.cost_per_purchase).toBeCloseTo(100) // 200 / 2
  })

  it("blocks the 7th video", async () => {
    await expect(
      getVideoComparison(manager, p("items=a,b,c,d,e,f,g&period=month&date=2026-06-15"))
    ).rejects.toMatchObject({ status: 400 })
  })

  it("only returns the extra columns that were requested", async () => {
    const r = await getVideoComparison(
      manager,
      p("items=ci1&period=month&date=2026-06-15&metrics=impressions")
    )
    expect(r.metrics_shown).toContain("impressions")
    expect(r.metrics_shown).not.toContain("ctr")
  })
})

// ── 7.6 permissions ───────────────────────────────────────────────────

describe("7.6 permissions", () => {
  it("staff is rejected from the report, the config and the comparison", async () => {
    col("contentItems").set("ci1", { code: "V1" })
    await expect(
      getProductReport(staff, p("period=month&date=2026-06-15"))
    ).rejects.toMatchObject({ status: 403 })
    await expect(getProductConfig(staff)).rejects.toMatchObject({ status: 403 })
    await expect(
      getVideoComparison(staff, p("items=ci1&period=month&date=2026-06-15"))
    ).rejects.toMatchObject({ status: 403 })
  })
})
