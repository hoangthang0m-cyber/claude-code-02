import {
  aggregateSnapshots,
  convertCurrency,
  type CurrencyRateInput,
} from "@/lib/domain"
import {
  bucketOf,
  type Granularity,
} from "@/modules/ads-overview/services/productReport"

// ads-overview-reporting change, group 6 (pure core). Fold each content item's
// ad-level snapshots into the video-comparison metrics. Zero denominator → null
// (rendered "—", spec §"CÁC chỉ số so sánh video").

export interface VideoSnapshotRow {
  ad_account_id: string
  ad_id: string
  stat_date: string
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
  video_plays: number
  video_3s_plays: number
  video_p100_plays: number
  account_currency: string
}

export interface VideoItemInput {
  content_item_id: string
  code: string
  has_binding: boolean
  snapshots: VideoSnapshotRow[]
}

export interface VideoMetrics {
  // 4 core (always shown)
  cost_per_purchase: number | null
  roas: number | null
  hook_rate: number | null
  retention_rate: number | null
  // optional extras
  ctr: number | null
  purchases: number
  spend: number
  revenue: number
  impressions: number
  clicks: number
}

export type VideoItemStatus = "ok" | "pending" | "no_binding"

export interface VideoComparisonItem {
  content_item_id: string
  code: string
  status: VideoItemStatus
  metrics: VideoMetrics
}

export interface VideoComparison {
  items: VideoComparisonItem[]
  accounts_missing_rate: string[]
}

const EMPTY_METRICS: VideoMetrics = {
  cost_per_purchase: null,
  roas: null,
  hook_rate: null,
  retention_rate: null,
  ctr: null,
  purchases: 0,
  spend: 0,
  revenue: 0,
  impressions: 0,
  clicks: 0,
}

// convert a row's money to the reporting currency; null if the account has no
// FX rate for that day
function convertRow(
  row: VideoSnapshotRow,
  rates: readonly CurrencyRateInput[],
  reportingCurrency: string
): VideoSnapshotRow | null {
  const s = convertCurrency(
    row.spend,
    row.account_currency,
    reportingCurrency,
    rates,
    row.stat_date
  )
  const r = convertCurrency(
    row.revenue,
    row.account_currency,
    reportingCurrency,
    rates,
    row.stat_date
  )
  if (!s.ok || !r.ok) return null
  return { ...row, spend: s.value, revenue: r.value }
}

function metricsOf(rows: readonly VideoSnapshotRow[]): VideoMetrics {
  const a = aggregateSnapshots(rows)
  return {
    cost_per_purchase: a.cost_per_purchase,
    roas: a.roas,
    hook_rate: a.hook_rate,
    retention_rate: a.retention_rate,
    ctr: a.ctr,
    purchases: a.purchases,
    spend: a.spend,
    revenue: a.revenue,
    impressions: a.impressions,
    clicks: a.clicks,
  }
}

export function buildVideoComparison(
  items: readonly VideoItemInput[],
  rates: readonly CurrencyRateInput[],
  reportingCurrency: string
): VideoComparison {
  const missing = new Set<string>()
  const out: VideoComparisonItem[] = items.map((item) => {
    if (!item.has_binding) {
      return {
        content_item_id: item.content_item_id,
        code: item.code,
        status: "no_binding",
        metrics: EMPTY_METRICS,
      }
    }
    if (item.snapshots.length === 0) {
      return {
        content_item_id: item.content_item_id,
        code: item.code,
        status: "pending",
        metrics: EMPTY_METRICS,
      }
    }
    const converted: VideoSnapshotRow[] = []
    for (const row of item.snapshots) {
      const c = convertRow(row, rates, reportingCurrency)
      if (c) converted.push(c)
      else missing.add(row.ad_account_id)
    }
    return {
      content_item_id: item.content_item_id,
      code: item.code,
      status: "ok",
      metrics: metricsOf(converted),
    }
  })
  return { items: out, accounts_missing_rate: [...missing].sort() }
}

// ── trend (task 6.6): one metric, one line per video, over the period ─────

export interface VideoSeriesPoint {
  bucket: string
  cost_per_purchase: number | null
  roas: number | null
  hook_rate: number | null
  retention_rate: number | null
  ctr: number | null
  spend: number
  revenue: number
  purchases: number
  impressions: number
}

export interface VideoSeries {
  buckets: string[]
  series: Array<{
    content_item_id: string
    code: string
    points: VideoSeriesPoint[]
  }>
}

export function buildVideoComparisonSeries(
  items: readonly VideoItemInput[],
  rates: readonly CurrencyRateInput[],
  reportingCurrency: string,
  granularity: Granularity
): VideoSeries {
  const bucketSet = new Set<string>()
  const perItem = new Map<string, Map<string, VideoSnapshotRow[]>>()

  for (const item of items) {
    const byBucket = new Map<string, VideoSnapshotRow[]>()
    for (const row of item.snapshots) {
      const c = convertRow(row, rates, reportingCurrency)
      if (!c) continue
      const b = bucketOf(row.stat_date, granularity)
      bucketSet.add(b)
      ;(byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(c)
    }
    perItem.set(item.content_item_id, byBucket)
  }

  const buckets = [...bucketSet].sort()
  return {
    buckets,
    series: items.map((item) => {
      const byBucket = perItem.get(item.content_item_id) ?? new Map()
      return {
        content_item_id: item.content_item_id,
        code: item.code,
        points: buckets.map((b) => {
          const a = aggregateSnapshots(byBucket.get(b) ?? [])
          return {
            bucket: b,
            cost_per_purchase: a.cost_per_purchase,
            roas: a.roas,
            hook_rate: a.hook_rate,
            retention_rate: a.retention_rate,
            ctr: a.ctr,
            spend: a.spend,
            revenue: a.revenue,
            purchases: a.purchases,
            impressions: a.impressions,
          }
        }),
      }
    }),
  }
}
