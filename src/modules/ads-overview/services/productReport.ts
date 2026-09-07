import {
  classifyCampaign,
  convertCurrency,
  resolveReportPeriod,
  type ClassifyConfig,
  type CurrencyRateInput,
} from "@/lib/domain"

// ads-overview-reporting change, group 4 (pure core). Classify every snapshot to
// a product, convert its money to the reporting currency, and fold into the
// per-product report or the day/week/month time series. Kept pure so the
// numbers are unit-tested against hand sums (task 4.1 "verify số khớp cộng thủ
// công").
//
// The product report shows 0 (never blank) for a product with spend but no
// revenue — ROAS = revenue / spend, or 0 when spend is 0 (spec §"BÁO CÁO chỉ
// số theo sản phẩm": "không để trống, không chia cho 0").

export interface ReportSnapshotRow {
  ad_account_id: string
  campaign_id: string
  campaign_name: string
  stat_date: string
  spend: number
  revenue: number
  account_currency: string
}

export interface ProductRef {
  id: string
  code: string
  name: string
}

export interface ProductBucket {
  product_id: string
  code: string
  name: string
  spend: number
  revenue: number
  roas: number
  campaign_count: number
}

export interface UnclassifiedBucket {
  campaign_count: number
  spend: number
  revenue: number
  roas: number
}

export interface ProductReport {
  products: ProductBucket[]
  /** sum of the products only — never includes "Chưa phân loại" (task 4.2) */
  total: {
    spend: number
    revenue: number
    roas: number
    campaign_count: number
  }
  unclassified: UnclassifiedBucket
  /** ad accounts left out of the money totals for lack of an FX rate */
  accounts_missing_rate: string[]
}

const roasOf = (spend: number, revenue: number): number =>
  spend > 0 ? revenue / spend : 0

interface Acc {
  spend: number
  revenue: number
  campaigns: Set<string>
}
const newAcc = (): Acc => ({ spend: 0, revenue: 0, campaigns: new Set() })

// classify + convert one snapshot; returns the bucket key ("__unc__" or a
// product id) and the converted money, or null when the account has no FX rate.
function place(
  s: ReportSnapshotRow,
  config: ClassifyConfig,
  rates: readonly CurrencyRateInput[],
  reportingCurrency: string
): { key: string; spend: number; revenue: number } | { missing: string } {
  const res = classifyCampaign(
    {
      ad_account_id: s.ad_account_id,
      campaign_id: s.campaign_id,
      campaign_name: s.campaign_name,
    },
    config
  )
  const cv = convertCurrency(
    s.spend,
    s.account_currency,
    reportingCurrency,
    rates,
    s.stat_date
  )
  const rv = convertCurrency(
    s.revenue,
    s.account_currency,
    reportingCurrency,
    rates,
    s.stat_date
  )
  if (!cv.ok || !rv.ok) return { missing: s.ad_account_id }
  return {
    key: res.product_id ?? "__unc__",
    spend: cv.value,
    revenue: rv.value,
  }
}

export function buildProductReport(
  snapshots: readonly ReportSnapshotRow[],
  config: ClassifyConfig,
  rates: readonly CurrencyRateInput[],
  reportingCurrency: string,
  products: readonly ProductRef[]
): ProductReport {
  const acc = new Map<string, Acc>()
  for (const p of products) acc.set(p.id, newAcc())
  const unc = newAcc()
  const missing = new Set<string>()

  for (const s of snapshots) {
    const placed = place(s, config, rates, reportingCurrency)
    if ("missing" in placed) {
      missing.add(placed.missing)
      continue
    }
    const target = placed.key === "__unc__" ? unc : acc.get(placed.key)
    if (!target) continue
    target.spend += placed.spend
    target.revenue += placed.revenue
    target.campaigns.add(s.campaign_id)
  }

  const productBuckets: ProductBucket[] = products.map((p) => {
    const a = acc.get(p.id)!
    return {
      product_id: p.id,
      code: p.code,
      name: p.name,
      spend: a.spend,
      revenue: a.revenue,
      roas: roasOf(a.spend, a.revenue),
      campaign_count: a.campaigns.size,
    }
  })

  const totalSpend = productBuckets.reduce((n, b) => n + b.spend, 0)
  const totalRevenue = productBuckets.reduce((n, b) => n + b.revenue, 0)

  return {
    products: productBuckets,
    total: {
      spend: totalSpend,
      revenue: totalRevenue,
      roas: roasOf(totalSpend, totalRevenue),
      campaign_count: productBuckets.reduce((n, b) => n + b.campaign_count, 0),
    },
    unclassified: {
      campaign_count: unc.campaigns.size,
      spend: unc.spend,
      revenue: unc.revenue,
      roas: roasOf(unc.spend, unc.revenue),
    },
    accounts_missing_rate: [...missing].sort(),
  }
}

// ── time series (task 4.3) ───────────────────────────────────────────────

export type Granularity = "day" | "week" | "month"

// bucket a stat_date to its day / ISO-week-Monday / month-first, using the
// shared progress-analytics period definition for week/month.
export function bucketOf(statDate: string, granularity: Granularity): string {
  if (granularity === "day") return statDate
  if (granularity === "month") return `${statDate.slice(0, 7)}-01`
  return resolveReportPeriod("week", statDate).start_date
}

export interface SeriesPoint {
  bucket: string
  spend: number
  revenue: number
  roas: number
}

export interface ProductSeries {
  product_id: string
  code: string
  name: string
  points: SeriesPoint[]
}

export interface Timeseries {
  granularity: Granularity
  buckets: string[]
  series: ProductSeries[]
  /** null unless a snapshot fell into "Chưa phân loại" */
  unclassified: { points: SeriesPoint[] } | null
  accounts_missing_rate: string[]
}

export function buildTimeseries(
  snapshots: readonly ReportSnapshotRow[],
  config: ClassifyConfig,
  rates: readonly CurrencyRateInput[],
  reportingCurrency: string,
  products: readonly ProductRef[],
  granularity: Granularity,
  filterProductId?: string
): Timeseries {
  // (bucketKey → (productKey → {spend,revenue}))
  const grid = new Map<string, Map<string, { spend: number; revenue: number }>>()
  const bucketSet = new Set<string>()
  const missing = new Set<string>()
  let sawUnclassified = false

  for (const s of snapshots) {
    const placed = place(s, config, rates, reportingCurrency)
    if ("missing" in placed) {
      missing.add(placed.missing)
      continue
    }
    if (placed.key === "__unc__") sawUnclassified = true
    if (filterProductId && placed.key !== filterProductId) continue
    const bucket = bucketOf(s.stat_date, granularity)
    bucketSet.add(bucket)
    const row = grid.get(bucket) ?? new Map()
    const cell = row.get(placed.key) ?? { spend: 0, revenue: 0 }
    cell.spend += placed.spend
    cell.revenue += placed.revenue
    row.set(placed.key, cell)
    grid.set(bucket, row)
  }

  const buckets = [...bucketSet].sort()
  const wanted = filterProductId
    ? products.filter((p) => p.id === filterProductId)
    : products

  const pointsFor = (key: string): SeriesPoint[] =>
    buckets.map((b) => {
      const cell = grid.get(b)?.get(key) ?? { spend: 0, revenue: 0 }
      return {
        bucket: b,
        spend: cell.spend,
        revenue: cell.revenue,
        roas: roasOf(cell.spend, cell.revenue),
      }
    })

  return {
    granularity,
    buckets,
    series: wanted.map((p) => ({
      product_id: p.id,
      code: p.code,
      name: p.name,
      points: pointsFor(p.id),
    })),
    unclassified:
      sawUnclassified && !filterProductId ? { points: pointsFor("__unc__") } : null,
    accounts_missing_rate: [...missing].sort(),
  }
}

// ── CSV (task 4.6) ───────────────────────────────────────────────────────

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function csvRows(rows: Array<Array<string | number>>): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
}

export function productReportCsv(
  report: ProductReport,
  currency: string
): string {
  const rows: Array<Array<string | number>> = [
    ["Sản phẩm", `Chi phí (${currency})`, `Doanh thu (${currency})`, "ROAS", "Số campaign"],
  ]
  for (const p of report.products) {
    rows.push([p.name, p.spend, p.revenue, p.roas, p.campaign_count])
  }
  rows.push([
    "Tổng 3 sản phẩm",
    report.total.spend,
    report.total.revenue,
    report.total.roas,
    report.total.campaign_count,
  ])
  rows.push([
    "Chưa phân loại",
    report.unclassified.spend,
    report.unclassified.revenue,
    report.unclassified.roas,
    report.unclassified.campaign_count,
  ])
  return csvRows(rows)
}

export function timeseriesCsv(ts: Timeseries, currency: string): string {
  const rows: Array<Array<string | number>> = [
    ["Mốc", "Sản phẩm", `Chi phí (${currency})`, `Doanh thu (${currency})`, "ROAS"],
  ]
  for (const s of ts.series) {
    for (const pt of s.points) {
      rows.push([pt.bucket, s.name, pt.spend, pt.revenue, pt.roas])
    }
  }
  if (ts.unclassified) {
    for (const pt of ts.unclassified.points) {
      rows.push([pt.bucket, "Chưa phân loại", pt.spend, pt.revenue, pt.roas])
    }
  }
  return csvRows(rows)
}
