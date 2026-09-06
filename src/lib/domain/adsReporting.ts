// ads-overview-reporting change, group 1 tasks 1.6 / 1.7. Pure helpers: fold a
// set of daily snapshots into totals + derived ratios, and convert an amount
// between currencies. Kept pure so the formulas are unit-tested directly
// (design.md Decision 5).

// ── 1.6 Aggregation ───────────────────────────────────────────────────────

export interface SnapshotTotalsInput {
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
  // video_* only exist on ad-level snapshots
  video_plays?: number
  video_3s_plays?: number
  video_p100_plays?: number
}

export interface AggregatedMetrics {
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
  video_plays: number
  video_3s_plays: number
  video_p100_plays: number
  /** revenue / spend — null when spend is 0 (render "—") */
  roas: number | null
  /** spend / purchases — null when purchases is 0 */
  cost_per_purchase: number | null
  /** video_3s_plays / video_plays — null when video_plays is 0 */
  hook_rate: number | null
  /** video_p100_plays / video_3s_plays — null when video_3s_plays is 0 */
  retention_rate: number | null
  /** clicks / impressions — null when impressions is 0 */
  ctr: number | null
}

// null on a zero denominator so the UI shows "—" rather than dividing by 0
// (spec "Mẫu số 0 → hiển thị '—'").
export function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

export function aggregateSnapshots(
  rows: readonly SnapshotTotalsInput[]
): AggregatedMetrics {
  let spend = 0
  let revenue = 0
  let purchases = 0
  let impressions = 0
  let clicks = 0
  let videoPlays = 0
  let video3s = 0
  let videoP100 = 0

  for (const r of rows) {
    spend += r.spend || 0
    revenue += r.revenue || 0
    purchases += r.purchases || 0
    impressions += r.impressions || 0
    clicks += r.clicks || 0
    videoPlays += r.video_plays || 0
    video3s += r.video_3s_plays || 0
    videoP100 += r.video_p100_plays || 0
  }

  return {
    spend,
    revenue,
    purchases,
    impressions,
    clicks,
    video_plays: videoPlays,
    video_3s_plays: video3s,
    video_p100_plays: videoP100,
    roas: ratioOrNull(revenue, spend),
    cost_per_purchase: ratioOrNull(spend, purchases),
    hook_rate: ratioOrNull(video3s, videoPlays),
    retention_rate: ratioOrNull(videoP100, video3s),
    ctr: ratioOrNull(clicks, impressions),
  }
}

// ── 1.7 Currency conversion ───────────────────────────────────────────────

export interface CurrencyRateInput {
  from_currency: string
  to_currency: string
  /** multiply an amount in from_currency by this to get to_currency */
  rate: number
  /** "YYYY-MM-DD" */
  effective_from: string
}

export type ConversionResult =
  | { ok: true; value: number; rate: number }
  | { ok: false; reason: "missing_rate" }

// design.md Decision 8: for a dated amount use the newest rate with
// effective_from <= that date; if none is dated that early, fall back to the
// current (newest overall) rate; with no rate at all the account is dropped
// from the total and the report notes "đang gộp N/M tài khoản".
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: readonly CurrencyRateInput[],
  onDate?: string
): ConversionResult {
  if (from === to) return { ok: true, value: amount, rate: 1 }

  const pair = rates
    .filter((r) => r.from_currency === from && r.to_currency === to)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
  if (pair.length === 0) return { ok: false, reason: "missing_rate" }

  let chosen: CurrencyRateInput | undefined
  if (onDate) {
    for (const r of pair) {
      if (r.effective_from <= onDate) chosen = r
    }
  }
  // no dated match (or no date given) → newest rate overall
  chosen ??= pair[pair.length - 1]

  return { ok: true, value: amount * chosen.rate, rate: chosen.rate }
}
