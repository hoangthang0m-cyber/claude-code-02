import type { Timestamp } from "firebase/firestore"

// ads-overview-reporting change, group 1 tasks 1.3 / 1.4. Daily insight
// snapshots (design.md Decision 1). The smallest grain the product report and
// the day/week/month charts are built from — a product total for any window is
// a sum + classify over these rows.
//
// Both collections are server-written only (background sync job, group 3).
// The doc id encodes the UNIQUE key so a re-sync of the same day upserts in
// place instead of duplicating.

// A local calendar date, "YYYY-MM-DD", in the ad account's own timezone.
export type StatDate = string

// ── AdsInsightSnapshot — campaign × day ────────────────────────────────────

export interface AdsInsightSnapshot {
  id: string
  ad_account_id: string
  campaign_id: string
  /** captured into the row so a renamed / deleted campaign still classifies */
  campaign_name: string
  campaign_status: string
  campaign_objective: string
  stat_date: StatDate
  spend: number
  /** omni_purchase conversion value */
  revenue: number
  /** omni_purchase count */
  purchases: number
  impressions: number
  clicks: number
  account_currency: string
  /** the day the underlying Meta figures were last read as still settling */
  data_as_of: Timestamp
  synced_at: Timestamp
}

// UNIQUE (ad_account_id, campaign_id, stat_date)
export function adsInsightSnapshotId(
  adAccountId: string,
  campaignId: string,
  statDate: StatDate
): string {
  return `${adAccountId}__${campaignId}__${statDate}`
}

// ── AdCreativeInsightSnapshot — ad × day (only ads with an AdsBinding) ──────

export interface AdCreativeInsightSnapshot {
  id: string
  ad_account_id: string
  campaign_id: string
  ad_id: string
  ad_name: string
  stat_date: StatDate
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
  video_plays: number
  video_3s_plays: number
  video_p100_plays: number
  account_currency: string
  data_as_of: Timestamp
  synced_at: Timestamp
}

// UNIQUE (ad_account_id, ad_id, stat_date)
export function adCreativeInsightSnapshotId(
  adAccountId: string,
  adId: string,
  statDate: StatDate
): string {
  return `${adAccountId}__${adId}__${statDate}`
}
