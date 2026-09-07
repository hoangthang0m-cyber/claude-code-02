import { computeMetricDelta, type MetricDelta } from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"

import { loadClassifyConfig } from "@/modules/ads-overview/services/productConfig.server"
import {
  loadCampaignSnapshots,
  loadCurrencyRates,
  loadFreshness,
  loadProducts,
  loadReportingCurrency,
  type ReportFreshness,
} from "@/modules/ads-overview/services/reportingData.server"
import { requireReportingManager } from "@/modules/ads-overview/services/reportingScope.server"
import {
  resolveComparisonWindows,
  resolveReportWindow,
  type ReportWindow,
} from "@/modules/ads-overview/services/reportWindow"
import {
  buildProductReport,
  buildTimeseries,
  productReportCsv,
  timeseriesCsv,
  type Granularity,
  type ProductReport,
  type Timeseries,
} from "@/modules/ads-overview/services/productReport"

// ads-overview-reporting change, group 4. Manager-only report endpoints built
// on the classified + currency-converted snapshot totals.

type Db = ReturnType<typeof getAdminDb>

const windowView = (w: ReportWindow) => ({ from: w.from, to: w.to, label: w.label })

async function reportForWindow(
  db: Db,
  window: ReportWindow
): Promise<{ report: ProductReport; reporting_currency: string }> {
  const [snapshots, config, rates, reportingCurrency, products] =
    await Promise.all([
      loadCampaignSnapshots(db, window),
      loadClassifyConfig(db),
      loadCurrencyRates(db),
      loadReportingCurrency(db),
      loadProducts(db),
    ])
  return {
    report: buildProductReport(
      snapshots,
      config,
      rates,
      reportingCurrency,
      products
    ),
    reporting_currency: reportingCurrency,
  }
}

// ── 4.1 / 4.2 / 4.5 the product report ───────────────────────────────────

export interface ProductReportResult extends ProductReport {
  window: { from: string; to: string; label: string }
  reporting_currency: string
  freshness: ReportFreshness
}

export async function getProductReport(
  actor: AuthedUser,
  params: URLSearchParams
): Promise<ProductReportResult> {
  requireReportingManager(actor)
  const db = getAdminDb()
  const window = resolveReportWindow(params)
  const { report, reporting_currency } = await reportForWindow(db, window)
  const freshness = await loadFreshness(db, report.accounts_missing_rate)
  return {
    ...report,
    window: windowView(window),
    reporting_currency,
    freshness: { ...freshness, accounts_missing_rate: report.accounts_missing_rate },
  }
}

// ── 4.3 the chart series ─────────────────────────────────────────────────

function granularityOf(params: URLSearchParams): Granularity {
  const g = params.get("bucket") ?? params.get("granularity") ?? "day"
  if (g === "day" || g === "week" || g === "month") return g
  throw new HttpError(400, "bucket phải là 'day', 'week' hoặc 'month'")
}

export interface TimeseriesResult extends Timeseries {
  window: { from: string; to: string; label: string }
  reporting_currency: string
}

export async function getReportTimeseries(
  actor: AuthedUser,
  params: URLSearchParams
): Promise<TimeseriesResult> {
  requireReportingManager(actor)
  const db = getAdminDb()
  const window = resolveReportWindow(params)
  const granularity = granularityOf(params)
  const filterProductId = params.get("product_id") ?? undefined

  const [snapshots, config, rates, reportingCurrency, products] =
    await Promise.all([
      loadCampaignSnapshots(db, window),
      loadClassifyConfig(db),
      loadCurrencyRates(db),
      loadReportingCurrency(db),
      loadProducts(db),
    ])

  return {
    ...buildTimeseries(
      snapshots,
      config,
      rates,
      reportingCurrency,
      products,
      granularity,
      filterProductId
    ),
    window: windowView(window),
    reporting_currency: reportingCurrency,
  }
}

// ── 4.4 period-over-period comparison ────────────────────────────────────

export type ComparedReportMetric = "spend" | "revenue" | "roas"

export interface ComparedRow {
  product_id: string | null // null = the total row
  code: string
  name: string
  deltas: Record<ComparedReportMetric, MetricDelta>
}

export interface ComparisonResult {
  current_window: { from: string; to: string; label: string }
  previous_window: { from: string; to: string; label: string }
  reporting_currency: string
  rows: ComparedRow[]
}

const METRICS: ComparedReportMetric[] = ["spend", "revenue", "roas"]

export async function getProductReportComparison(
  actor: AuthedUser,
  params: URLSearchParams
): Promise<ComparisonResult> {
  requireReportingManager(actor)
  const db = getAdminDb()
  const { current, previous } = resolveComparisonWindows(params)

  const [cur, prev] = await Promise.all([
    reportForWindow(db, current),
    reportForWindow(db, previous),
  ])

  const prevByProduct = new Map(prev.report.products.map((p) => [p.product_id, p]))

  const rows: ComparedRow[] = cur.report.products.map((p) => {
    const q = prevByProduct.get(p.product_id)
    return {
      product_id: p.product_id,
      code: p.code,
      name: p.name,
      deltas: {
        spend: computeMetricDelta(p.spend, q?.spend ?? 0),
        revenue: computeMetricDelta(p.revenue, q?.revenue ?? 0),
        roas: computeMetricDelta(p.roas, q?.roas ?? 0),
      },
    }
  })

  rows.push({
    product_id: null,
    code: "",
    name: "Tổng 3 sản phẩm",
    deltas: METRICS.reduce(
      (acc, m) => {
        acc[m] = computeMetricDelta(cur.report.total[m], prev.report.total[m])
        return acc
      },
      {} as Record<ComparedReportMetric, MetricDelta>
    ),
  })

  return {
    current_window: windowView(current),
    previous_window: windowView(previous),
    reporting_currency: cur.reporting_currency,
    rows,
  }
}

// ── 4.6 CSV export ──────────────────────────────────────────────────────

export async function getReportExport(
  actor: AuthedUser,
  params: URLSearchParams
): Promise<{ filename: string; csv: string }> {
  requireReportingManager(actor)
  const db = getAdminDb()
  const window = resolveReportWindow(params)
  const kind = params.get("format") ?? "report"

  if (kind === "timeseries") {
    const ts = await getReportTimeseries(actor, params)
    return {
      filename: `bao-cao-bieu-do_${window.from}_${window.to}.csv`,
      csv: timeseriesCsv(ts, ts.reporting_currency),
    }
  }
  if (kind === "report") {
    const { report, reporting_currency } = await reportForWindow(db, window)
    return {
      filename: `bao-cao-san-pham_${window.from}_${window.to}.csv`,
      csv: productReportCsv(report, reporting_currency),
    }
  }
  throw new HttpError(400, "format phải là 'report' hoặc 'timeseries'")
}
