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

// ── Per-person workload (SPEC §5.6 R2, task 8.2) ────────────────────────────

// A content person's job on an item ends at `da_duyet` (approval); after that
// it belongs to the ads side. So "đang thực hiện" excludes da_duyet + da_len_ads
// and "hoàn tất" / the lead-time endpoint are both measured at `da_duyet`.
const DONE_FOR_ASSIGNEE = new Set<ContentStatus>(["da_duyet", "da_len_ads"])

export interface PersonItemInput {
  status: ContentStatus
  deadline_ms: number | null
  /** earliest StatusHistory `created_at` for this item, ms (work first moved) —
   *  the "nhận việc" proxy, since assignment is not in StatusHistory */
  started_ms: number | null
  /** `created_at` of this item's `to_status == "da_duyet"` history entry, ms;
   *  null if it never reached approval */
  approved_ms: number | null
}

export interface PersonPerformance {
  in_progress: number
  completed_in_period: number
  overdue: number
  has_overdue: boolean
  /** mean (approved_ms − started_ms) over the items completed in the period;
   *  null when none were */
  avg_lead_time_ms: number | null
}

export const EMPTY_PERSON_PERFORMANCE: PersonPerformance = {
  in_progress: 0,
  completed_in_period: 0,
  overdue: 0,
  has_overdue: false,
  avg_lead_time_ms: null,
}

export function computePersonPerformance(
  items: readonly PersonItemInput[],
  period: { from_ms: number; to_ms: number },
  nowMs: number
): PersonPerformance {
  let inProgress = 0
  let overdue = 0
  let completed = 0
  const leadTimes: number[] = []

  for (const item of items) {
    if (!DONE_FOR_ASSIGNEE.has(item.status)) inProgress++
    if (isOverdue(item.deadline_ms, item.status, nowMs)) overdue++

    const approvedInPeriod =
      item.approved_ms != null &&
      item.approved_ms >= period.from_ms &&
      item.approved_ms < period.to_ms
    if (approvedInPeriod) {
      completed++
      if (item.started_ms != null && item.approved_ms! >= item.started_ms) {
        leadTimes.push(item.approved_ms! - item.started_ms)
      }
    }
  }

  return {
    in_progress: inProgress,
    completed_in_period: completed,
    overdue,
    has_overdue: overdue > 0,
    avg_lead_time_ms: leadTimes.length
      ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
      : null,
  }
}
