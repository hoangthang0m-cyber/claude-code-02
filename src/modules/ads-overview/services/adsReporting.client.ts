import { authedJson } from "@/lib/api/authedFetch"
import type { MetricDelta } from "@/lib/domain"
import type {
  ProductReport,
  Timeseries,
} from "@/modules/ads-overview/services/productReport"

// Client wrappers for the ads-overview-reporting APIs (group 5). All endpoints
// are manager-only and enforced server-side.

export type Granularity = "day" | "week" | "month"
export type PeriodKind = "week" | "month"

interface WindowView {
  from: string
  to: string
  label: string
}

export interface ReportFreshnessView {
  data_through: string | null
  accounts_total: number
  accounts_merged: number
  accounts_delayed: Array<{
    ad_account_id: string
    name: string
    last_result: string
    message: string | null
  }>
  accounts_missing_rate: string[]
}

export interface ProductReportResponse extends ProductReport {
  window: WindowView
  reporting_currency: string
  freshness: ReportFreshnessView
}

export interface TimeseriesResponse extends Timeseries {
  window: WindowView
  reporting_currency: string
}

export interface ComparisonRow {
  product_id: string | null
  code: string
  name: string
  deltas: Record<"spend" | "revenue" | "roas", MetricDelta>
}

export interface ComparisonResponse {
  current_window: WindowView
  previous_window: WindowView
  reporting_currency: string
  rows: ComparisonRow[]
}

// build ?period=&date= or ?from=&to=
function windowQuery(params: {
  kind: PeriodKind | "range"
  date?: string
  from?: string
  to?: string
}): string {
  const q = new URLSearchParams()
  if (params.kind === "range") {
    q.set("from", params.from ?? "")
    q.set("to", params.to ?? "")
  } else {
    q.set("period", params.kind)
    q.set("date", params.date ?? "")
  }
  return q.toString()
}

export interface ReportQuery {
  kind: PeriodKind | "range"
  date?: string
  from?: string
  to?: string
}

export function getProductReport(query: ReportQuery) {
  return authedJson<ProductReportResponse>(
    `/api/ads-reporting/report?${windowQuery(query)}`
  )
}

export function getReportComparison(kind: PeriodKind, date: string) {
  return authedJson<ComparisonResponse>(
    `/api/ads-reporting/report/comparison?period=${kind}&date=${date}`
  )
}

export function getReportTimeseries(
  query: ReportQuery,
  bucket: Granularity,
  productId?: string
) {
  const q = new URLSearchParams(windowQuery(query))
  q.set("bucket", bucket)
  if (productId) q.set("product_id", productId)
  return authedJson<TimeseriesResponse>(`/api/ads-reporting/timeseries?${q}`)
}

export function reportExportUrl(
  query: ReportQuery,
  format: "report" | "timeseries",
  bucket?: Granularity
): string {
  const q = new URLSearchParams(windowQuery(query))
  q.set("format", format)
  if (bucket) q.set("bucket", bucket)
  return `/api/ads-reporting/export?${q}`
}

export interface UnclassifiedResponse {
  campaign_count: number
  spend: number
  revenue: number
  accounts_missing_rate: string[]
  window: WindowView
  reporting_currency: string
}

export function getUnclassified(query: ReportQuery) {
  return authedJson<UnclassifiedResponse>(
    `/api/ads-reporting/unclassified?${windowQuery(query)}`
  )
}

// ── config (task 5.6) ───────────────────────────────────────────────────

export interface ReportConfig {
  products: Array<{ id: string; code: string; name: string; keywords: string[] }>
  rules: Array<{
    id: string
    ad_account_id: string
    product_id: string
    is_account_default: boolean
  }>
  overrides: Array<{
    id: string
    ad_account_id: string
    campaign_id: string
    product_id: string
  }>
  accounts: Array<{ ad_account_id: string; name: string }>
  reporting_currency: string
  currency_rates: Array<{
    id: string
    from_currency: string
    to_currency: string
    rate: number
    effective_from: string
  }>
}

export function getReportConfig() {
  return authedJson<ReportConfig>("/api/ads-reporting/config")
}

export function createProduct(body: {
  code: string
  name: string
  keywords: string[]
}) {
  return authedJson<{ id: string }>("/api/ads-reporting/products", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateProduct(
  productId: string,
  body: { name?: string; keywords?: string[] }
) {
  return authedJson<{ id: string }>(
    `/api/ads-reporting/products/${productId}`,
    { method: "PATCH", body: JSON.stringify(body) }
  )
}

export function deleteProduct(productId: string) {
  return authedJson<{ id: string; removed: true }>(
    `/api/ads-reporting/products/${productId}`,
    { method: "DELETE" }
  )
}

export function setAccountRules(body: {
  ad_account_id: string
  product_ids: string[]
  default_product_id: string | null
}) {
  return authedJson<{ ad_account_id: string; rules: number }>(
    "/api/ads-reporting/account-rules",
    { method: "PUT", body: JSON.stringify(body) }
  )
}

export function setCampaignOverride(body: {
  ad_account_id: string
  campaign_id: string
  product_id: string | null
}) {
  return authedJson<{ id: string; removed?: true }>(
    "/api/ads-reporting/campaign-overrides",
    { method: "POST", body: JSON.stringify(body) }
  )
}

export function updateReportingCurrency(reporting_currency: string) {
  return authedJson<{ reporting_currency: string }>(
    "/api/ads-reporting/settings",
    { method: "PUT", body: JSON.stringify({ reporting_currency }) }
  )
}

export function addCurrencyRate(body: {
  from_currency: string
  to_currency: string
  rate: number
  effective_from: string
}) {
  return authedJson<{ id: string }>("/api/ads-reporting/currency-rates", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function deleteCurrencyRate(rateId: string) {
  return authedJson<{ id: string; removed: true }>(
    `/api/ads-reporting/currency-rates/${rateId}`,
    { method: "DELETE" }
  )
}
