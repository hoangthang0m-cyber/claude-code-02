import { isOverdue } from "@/lib/domain/contentItem"
import { CONTENT_STATUSES, type ContentStatus } from "@/lib/domain/enums"

// SPEC §5.6 R1, task 8.1: the six progress-dashboard counters. Pure so the
// formula is unit-tested against sample data; the service just feeds it rows.

// "Chờ duyệt (kịch bản + video)" — waiting on a manager.
export const PENDING_REVIEW_STATUSES = [
  "cho_duyet_kich_ban",
  "cho_duyet_video",
] as const satisfies readonly ContentStatus[]

// "Đang sản xuất" — still in the pipeline, neither awaiting review nor already
// on ads. Defined as the complement so `total = in_production + pending_review
// + published` always holds.
export const IN_PRODUCTION_STATUSES: readonly ContentStatus[] =
  CONTENT_STATUSES.filter(
    (s) =>
      s !== "da_len_ads" &&
      !(PENDING_REVIEW_STATUSES as readonly ContentStatus[]).includes(s)
  )

export interface DashboardItemInput {
  status: ContentStatus
  deadline_ms: number | null
  /** the item's current AdsMetric has delivery_status "active" */
  ads_active: boolean
}

export interface ProgressDashboard {
  total: number
  in_production: number
  pending_review: number
  overdue: number
  published: number
  ads_running: number
}

export const EMPTY_PROGRESS_DASHBOARD: ProgressDashboard = {
  total: 0,
  in_production: 0,
  pending_review: 0,
  overdue: 0,
  published: 0,
  ads_running: 0,
}

function isPendingReview(status: ContentStatus): boolean {
  return (PENDING_REVIEW_STATUSES as readonly ContentStatus[]).includes(status)
}

export function computeProgressDashboard(
  items: readonly DashboardItemInput[],
  nowMs: number
): ProgressDashboard {
  const d: ProgressDashboard = { ...EMPTY_PROGRESS_DASHBOARD }
  for (const item of items) {
    d.total++
    if (item.status === "da_len_ads") d.published++
    else if (isPendingReview(item.status)) d.pending_review++
    else d.in_production++

    // §6.7: computed, cross-cutting — an overdue item is still counted in one of
    // the buckets above.
    if (isOverdue(item.deadline_ms, item.status, nowMs)) d.overdue++
    if (item.ads_active) d.ads_running++
  }
  return d
}
