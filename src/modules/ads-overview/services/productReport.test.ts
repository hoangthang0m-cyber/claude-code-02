import { describe, expect, it } from "vitest"

import type { ClassifyConfig, CurrencyRateInput } from "@/lib/domain"
import {
  bucketOf,
  buildProductReport,
  buildTimeseries,
  productReportCsv,
  timeseriesCsv,
  type ProductRef,
  type ReportSnapshotRow,
} from "@/modules/ads-overview/services/productReport"

const PRODUCTS: ProductRef[] = [
  { id: "a", code: "a", name: "An Mệnh Hòa Duyên" },
  { id: "t", code: "t", name: "Tứ Bản Định Mệnh" },
  { id: "h", code: "h", name: "Hiếu Mệnh Dưỡng Con" },
]

const config: ClassifyConfig = {
  products: [
    { id: "a", code: "a", keywords: [] },
    { id: "t", code: "t", keywords: [] },
    { id: "h", code: "h", keywords: ["hmdc"] },
  ],
  rules: [
    { ad_account_id: "amhd", product_id: "a", is_account_default: true },
    { ad_account_id: "shared", product_id: "t", is_account_default: true },
    { ad_account_id: "shared", product_id: "h", is_account_default: false },
  ],
  overrides: [],
}

const row = (o: Partial<ReportSnapshotRow>): ReportSnapshotRow => ({
  ad_account_id: "amhd",
  campaign_id: "c1",
  campaign_name: "video 1",
  stat_date: "2026-06-10",
  spend: 0,
  revenue: 0,
  account_currency: "VND",
  ...o,
})

describe("buildProductReport (tasks 4.1 / 4.2)", () => {
  it("sums per product from the classified snapshots and matches a hand total", () => {
    const r = buildProductReport(
      [
        row({ ad_account_id: "amhd", campaign_id: "a1", spend: 100, revenue: 300 }),
        row({ ad_account_id: "amhd", campaign_id: "a2", spend: 50, revenue: 100 }),
        row({ ad_account_id: "shared", campaign_id: "t1", campaign_name: "thắng - T(1/6)", spend: 80, revenue: 160 }),
        row({ ad_account_id: "shared", campaign_id: "h1", campaign_name: "HMDC video", spend: 40, revenue: 20 }),
      ],
      config,
      [],
      "VND",
      PRODUCTS
    )
    const a = r.products.find((p) => p.product_id === "a")!
    expect(a).toMatchObject({ spend: 150, revenue: 400, campaign_count: 2 })
    expect(a.roas).toBeCloseTo(400 / 150)
    expect(r.products.find((p) => p.product_id === "t")).toMatchObject({ spend: 80, revenue: 160 })
    expect(r.products.find((p) => p.product_id === "h")).toMatchObject({ spend: 40, revenue: 20 })
    // total = sum of the 3 products
    expect(r.total).toMatchObject({ spend: 270, revenue: 580, campaign_count: 4 })
  })

  it("keeps 'Chưa phân loại' out of the 3-product total (task 4.2)", () => {
    const r = buildProductReport(
      [
        row({ ad_account_id: "amhd", campaign_id: "a1", spend: 100, revenue: 100 }),
        row({ ad_account_id: "orphan", campaign_id: "x1", spend: 999, revenue: 999 }),
      ],
      config,
      [],
      "VND",
      PRODUCTS
    )
    expect(r.total.spend).toBe(100)
    expect(r.unclassified).toMatchObject({ campaign_count: 1, spend: 999, revenue: 999 })
  })

  it("shows ROAS 0 (not blank) for spend but no revenue", () => {
    const r = buildProductReport(
      [row({ ad_account_id: "amhd", spend: 80, revenue: 0 })],
      config,
      [],
      "VND",
      PRODUCTS
    )
    expect(r.products.find((p) => p.product_id === "a")!.roas).toBe(0)
  })

  it("converts foreign currency and drops an account with no rate", () => {
    const rates: CurrencyRateInput[] = [
      { from_currency: "USD", to_currency: "VND", rate: 25_000, effective_from: "2026-01-01" },
    ]
    const r = buildProductReport(
      [
        row({ ad_account_id: "amhd", account_currency: "USD", spend: 2, revenue: 6 }),
        row({ ad_account_id: "shared", campaign_name: "T(1/6)", account_currency: "EUR", spend: 5, revenue: 5 }),
      ],
      config,
      rates,
      "VND",
      PRODUCTS
    )
    expect(r.products.find((p) => p.product_id === "a")!.spend).toBe(50_000)
    expect(r.accounts_missing_rate).toEqual(["shared"])
  })
})

describe("bucketOf (task 4.3)", () => {
  it("day = the date itself", () => {
    expect(bucketOf("2026-06-17", "day")).toBe("2026-06-17")
  })
  it("month = first of month", () => {
    expect(bucketOf("2026-06-17", "month")).toBe("2026-06-01")
  })
  it("week = ISO Monday", () => {
    // 2026-06-15 is a Monday
    expect(bucketOf("2026-06-17", "week")).toBe("2026-06-15")
  })
})

describe("buildTimeseries (task 4.3)", () => {
  const rows = [
    row({ ad_account_id: "amhd", campaign_id: "a1", stat_date: "2026-06-01", spend: 10, revenue: 20 }),
    row({ ad_account_id: "amhd", campaign_id: "a1", stat_date: "2026-06-02", spend: 5, revenue: 0 }),
    row({ ad_account_id: "shared", campaign_name: "T(1/6)", campaign_id: "t1", stat_date: "2026-06-01", spend: 8, revenue: 8 }),
  ]

  it("groups by day with a series per product, 0-filled", () => {
    const ts = buildTimeseries(rows, config, [], "VND", PRODUCTS, "day")
    expect(ts.buckets).toEqual(["2026-06-01", "2026-06-02"])
    const a = ts.series.find((s) => s.product_id === "a")!
    expect(a.points).toEqual([
      { bucket: "2026-06-01", spend: 10, revenue: 20, roas: 2 },
      { bucket: "2026-06-02", spend: 5, revenue: 0, roas: 0 },
    ])
    const h = ts.series.find((s) => s.product_id === "h")!
    expect(h.points.every((p) => p.spend === 0)).toBe(true)
  })

  it("collapses to one bucket at month granularity", () => {
    const ts = buildTimeseries(rows, config, [], "VND", PRODUCTS, "month")
    expect(ts.buckets).toEqual(["2026-06-01"])
    expect(ts.series.find((s) => s.product_id === "a")!.points[0]).toMatchObject({
      spend: 15,
      revenue: 20,
    })
  })

  it("filters to one product when product_id is given", () => {
    const ts = buildTimeseries(rows, config, [], "VND", PRODUCTS, "day", "t")
    expect(ts.series).toHaveLength(1)
    expect(ts.series[0].product_id).toBe("t")
  })

  it("adds an unclassified series when a snapshot falls there", () => {
    const ts = buildTimeseries(
      [...rows, row({ ad_account_id: "orphan", campaign_id: "x", stat_date: "2026-06-01", spend: 3, revenue: 1 })],
      config,
      [],
      "VND",
      PRODUCTS,
      "day"
    )
    expect(ts.unclassified?.points[0]).toMatchObject({ spend: 3, revenue: 1 })
  })
})

describe("CSV (task 4.6)", () => {
  it("product report CSV has a row per product plus total + unclassified", () => {
    const r = buildProductReport(
      [row({ ad_account_id: "amhd", spend: 100, revenue: 250 })],
      config,
      [],
      "VND",
      PRODUCTS
    )
    const csv = productReportCsv(r, "VND")
    const lines = csv.split("\r\n")
    expect(lines[0]).toContain("Sản phẩm")
    expect(lines).toHaveLength(1 + 3 + 2) // header + 3 products + total + unclassified
    expect(lines.at(-1)).toContain("Chưa phân loại")
  })

  it("timeseries CSV has a row per bucket × series", () => {
    const ts = buildTimeseries(
      [row({ ad_account_id: "amhd", stat_date: "2026-06-01", spend: 1, revenue: 2 })],
      config,
      [],
      "VND",
      PRODUCTS,
      "day"
    )
    const csv = timeseriesCsv(ts, "VND")
    expect(csv.split("\r\n")[0]).toContain("Mốc")
    expect(csv).toContain("An Mệnh Hòa Duyên")
  })
})
