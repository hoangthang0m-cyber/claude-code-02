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
    return true
  })
function q(name: string, fs: Filter[]) {
  return {
    where: (f: string, o: string, v: unknown) => q(name, [...fs, [f, o, v]]),
    orderBy: () => q(name, fs),
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
import {
  getProductReport,
  getProductReportComparison,
} from "@/modules/ads-overview/services/productReport.server"

const manager: AuthedUser = { uid: "m", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "s", email: null, system_role: "staff" }
const p = (s: string) => new URLSearchParams(s)

function snap(id: string, o: Partial<Doc>) {
  col("adsInsightSnapshots").set(id, {
    ad_account_id: "amhd",
    campaign_id: "a1",
    campaign_name: "video",
    account_currency: "VND",
    spend: 0,
    revenue: 0,
    ...o,
  })
}

beforeEach(() => {
  store.clear()
  col("products").set("a", { code: "a", name: "AMHD", keywords: [] })
  col("productAccountRules").set("amhd__a", {
    ad_account_id: "amhd",
    product_id: "a",
    is_account_default: true,
  })
  col("reportingSettings").set("default", { reporting_currency: "VND" })
  col("adAccountConnections").set("m__amhd", {
    project_owner_id: "m",
    ad_account_id: "amhd",
    name: "AMHD - Backup",
  })
})

describe("getProductReport (tasks 4.1 / 4.5)", () => {
  // Từ 2026-09-28 mọi thành viên đăng nhập đều xem được báo cáo hiệu quả
  // quảng cáo; chỉ sửa cấu hình mới giới hạn Trưởng phòng.
  it("cho nhân viên xem báo cáo", async () => {
    await expect(
      getProductReport(staff, p("period=month&date=2026-06-15"))
    ).resolves.toBeTruthy()
  })

  it("aggregates the window and reports freshness", async () => {
    snap("s1", { stat_date: "2026-06-05", spend: 100, revenue: 300 })
    snap("s2", { stat_date: "2026-05-30", spend: 999, revenue: 999 }) // outside June
    col("adAccountReportSyncStates").set("amhd__campaign", {
      ad_account_id: "amhd",
      scope: "campaign",
      latest_synced_date: "2026-06-14",
      last_result: "ok",
    })
    const r = await getProductReport(manager, p("period=month&date=2026-06-15"))
    expect(r.total.spend).toBe(100)
    expect(r.window).toMatchObject({ from: "2026-06-01", to: "2026-06-30" })
    expect(r.freshness).toMatchObject({
      data_through: "2026-06-14",
      accounts_total: 1,
      accounts_merged: 1,
    })
  })

  // Chốt lại lỗi thật đã xảy ra: job đồng bộ ngừng chạy hẳn thì server không
  // ghi gì, last_result kẹt ở "ok", và báo cáo mục rữa trong im lặng ba ngày.
  // Giao diện cần biết lần ghi trạng thái CUỐI CÙNG cách đây bao lâu, nên
  // freshness phải mang theo mốc đó — lấy max trên mọi tài khoản.
  it("mang theo mốc đồng bộ gần nhất, kể cả khi mọi tài khoản đều ok", async () => {
    snap("s1", { stat_date: "2026-06-05", spend: 100, revenue: 100 })
    const older = new Date("2026-06-10T01:00:00Z").getTime()
    const newer = new Date("2026-06-12T03:00:00Z").getTime()
    col("adAccountReportSyncStates").set("amhd__campaign", {
      ad_account_id: "amhd",
      scope: "campaign",
      latest_synced_date: "2026-06-14",
      last_result: "ok",
      updated_at: { toMillis: () => older },
    })
    col("adAccountReportSyncStates").set("second__campaign", {
      ad_account_id: "second",
      scope: "campaign",
      latest_synced_date: "2026-06-14",
      last_result: "ok",
      updated_at: { toMillis: () => newer },
    })

    const r = await getProductReport(manager, p("period=month&date=2026-06-15"))

    expect(r.freshness.last_synced_at).toBe(newer)
    // không tài khoản nào "delayed" — đúng kiểu sự cố đã xảy ra
    expect(r.freshness.accounts_delayed).toEqual([])
  })

  it("để last_synced_at là null khi chưa đồng bộ lần nào", async () => {
    snap("s1", { stat_date: "2026-06-05", spend: 100, revenue: 100 })
    const r = await getProductReport(manager, p("period=month&date=2026-06-15"))
    expect(r.freshness.last_synced_at).toBeNull()
  })

  it("flags a delayed account in freshness", async () => {
    snap("s1", { stat_date: "2026-06-05", spend: 100, revenue: 100 })
    col("adAccountReportSyncStates").set("amhd__campaign", {
      ad_account_id: "amhd",
      scope: "campaign",
      latest_synced_date: "2026-06-10",
      last_result: "warning",
      message: "rate limit",
    })
    const r = await getProductReport(manager, p("period=month&date=2026-06-15"))
    expect(r.freshness.accounts_delayed).toEqual([
      { ad_account_id: "amhd", name: "AMHD - Backup", last_result: "warning", message: "rate limit" },
    ])
    expect(r.freshness.accounts_merged).toBe(0) // 1 total − 1 delayed
  })
})

describe("getProductReportComparison (task 4.4)", () => {
  it("percentage change is null when the previous period is empty", async () => {
    // June has data, May does not
    snap("s1", { stat_date: "2026-06-05", spend: 200, revenue: 500 })
    const r = await getProductReportComparison(manager, p("period=month&date=2026-06-15"))
    expect(r.current_window.from).toBe("2026-06-01")
    expect(r.previous_window.from).toBe("2026-05-01")
    const total = r.rows.find((x) => x.product_id === null)!
    expect(total.deltas.spend).toMatchObject({ current: 200, previous: 0, abs: 200, pct: null })
  })

  it("computes an absolute + percentage delta when both periods have data", async () => {
    snap("jun", { stat_date: "2026-06-05", spend: 150, revenue: 0 })
    snap("may", { stat_date: "2026-05-05", spend: 100, revenue: 0 })
    const r = await getProductReportComparison(manager, p("period=month&date=2026-06-15"))
    const a = r.rows.find((x) => x.product_id === "a")!
    expect(a.deltas.spend).toMatchObject({ current: 150, previous: 100, abs: 50, pct: 0.5 })
  })

  it("rejects a from/to range (comparison needs a named period)", async () => {
    await expect(
      getProductReportComparison(manager, p("from=2026-06-01&to=2026-06-30"))
    ).rejects.toMatchObject({ status: 400 })
  })
})
