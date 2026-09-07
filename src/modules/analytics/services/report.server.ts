import {
  COLLECTIONS,
  comparePeriodReports,
  computePeriodReport,
  resolveReportPeriod,
  type ComparedMetric,
  type ContentStatus,
  type MetricDelta,
  type PeriodReport,
  type ReportCohortItem,
  type ReportPeriod,
  type ReportPeriodKind,
} from "@/lib/domain"
import { findTransition } from "@/lib/workflow/stateMachine"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import {
  pickCurrentMetric,
  toMetricView,
} from "@/modules/ads-performance/services/adsMetrics.server"
import {
  chunkedIn,
  resolveAnalyticsScope,
  scopedView,
  type ScopedView,
} from "@/modules/analytics/services/scope.server"

// SPEC §5.6 R3 / R4, tasks 8.3 / 8.4: the weekly / monthly overview report and
// its comparison with the immediately-preceding period. Periods are resolved
// server-side in Asia/Ho_Chi_Minh with a Monday week start (§8 Q4).

type Db = ReturnType<typeof getAdminDb>

interface PeriodView {
  kind: ReportPeriodKind
  start: number
  end: number
  start_date: string
}

export interface PeriodReportResult extends PeriodReport {
  mode: "manager" | "staff"
  period: PeriodView
}

export interface PeriodComparisonResult {
  mode: "manager" | "staff"
  period: PeriodView
  previous_period: PeriodView
  current: PeriodReport
  previous: PeriodReport
  deltas: Record<ComparedMetric, MetricDelta>
}

function tsMs(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : null
}

function isReturn(from: unknown, to: unknown): boolean {
  return (
    findTransition(from as ContentStatus, to as ContentStatus)?.kind === "return"
  )
}

function validatePeriod(kind: string, date: string): ReportPeriod {
  if (kind !== "week" && kind !== "month") {
    throw new HttpError(400, "period phải là 'week' hoặc 'month'")
  }
  try {
    return resolveReportPeriod(kind, date)
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Ngày không hợp lệ")
  }
}

// The §5.6 R3 metrics for one [start, end) window, over an explicit project-id
// set (task 1.4 — `scope.project_ids` may be one project, a manager's managed
// set, or a group's child projects).
async function reportForWindow(
  db: Db,
  scope: ScopedView,
  start: number,
  end: number
): Promise<PeriodReport> {
  if (scope.project_ids.length === 0) return computePeriodReport([], 0)

  const itemDocs = await chunkedIn(scope.project_ids, async (batch) => {
    const snap = await db
      .collection(COLLECTIONS.contentItems)
      .where("project_id", "in", batch)
      .get()
    return snap.docs
  })
  const items = itemDocs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((i) =>
      scope.mode === "manager" ? true : i.data.assignee_id === scope.uid
    )
  if (items.length === 0) return computePeriodReport([], 0)

  const historyDocs = await chunkedIn(
    items.map((i) => i.id),
    async (batch) => {
      const snap = await db
        .collection(COLLECTIONS.statusHistory)
        .where("content_item_id", "in", batch)
        .get()
      return snap.docs
    }
  )
  const publishedMs = new Map<string, number>()
  let returnsInPeriod = 0
  for (const h of historyDocs) {
    const d = h.data()
    const at = tsMs(d.created_at)
    if (at == null || at < start || at >= end) continue
    if (d.to_status === "da_len_ads") {
      const id = String(d.content_item_id ?? "")
      const prev = publishedMs.get(id)
      if (prev == null || at < prev) publishedMs.set(id, at)
    }
    if (isReturn(d.from_status, d.to_status)) returnsInPeriod++
  }

  const cohortItems = items.filter((i) => publishedMs.has(i.id))
  if (cohortItems.length === 0) return computePeriodReport([], returnsInPeriod)

  const byItem = new Map<string, ReturnType<typeof toMetricView>[]>()
  const metricDocs = await chunkedIn(
    cohortItems.map((i) => i.id),
    async (batch) => {
      const snap = await db
        .collection(COLLECTIONS.adsMetrics)
        .where("content_item_id", "in", batch)
        .get()
      return snap.docs
    }
  )
  for (const d of metricDocs) {
    const key = String(d.data().content_item_id ?? "")
    if (!key) continue
    const list = byItem.get(key) ?? []
    list.push(toMetricView(d.id, d.data()))
    byItem.set(key, list)
  }

  const cohort: ReportCohortItem[] = cohortItems.map((i) => {
    const current = pickCurrentMetric(byItem.get(i.id) ?? [])
    return {
      content_item_id: i.id,
      code: String(i.data.code ?? i.id),
      published_ms: publishedMs.get(i.id)!,
      deadline_ms: tsMs(i.data.deadline),
      ads: current
        ? { spend: current.spend, messages: current.messages, roas: current.roas }
        : null,
    }
  })

  return computePeriodReport(cohort, returnsInPeriod)
}

// task 1.4 — the report core: the §5.6 R3 report for a period over an explicit
// project-id set. `getPeriodReport` (project-level) and the group roll-up
// (task 5.3) are thin wrappers that resolve their own set and call this.
export async function periodReportForScope(
  scope: ScopedView,
  kind: string,
  date: string
): Promise<PeriodReportResult> {
  const period = validatePeriod(kind, date)
  const db = getAdminDb()
  const report = await reportForWindow(db, scope, period.start, period.end)
  return {
    ...report,
    mode: scope.mode,
    period: {
      kind: kind as ReportPeriodKind,
      start: period.start,
      end: period.end,
      start_date: period.start_date,
    },
  }
}

// task 1.4 — the comparison core (task 5.4 reuses it for the group roll-up).
export async function periodComparisonForScope(
  scope: ScopedView,
  kind: string,
  date: string
): Promise<PeriodComparisonResult> {
  const period = validatePeriod(kind, date)
  const db = getAdminDb()

  const [current, previous] = await Promise.all([
    reportForWindow(db, scope, period.start, period.end),
    reportForWindow(db, scope, period.previous.start, period.previous.end),
  ])

  const view = (
    start: number,
    end: number,
    start_date: string
  ): PeriodView => ({ kind: kind as ReportPeriodKind, start, end, start_date })

  return {
    mode: scope.mode,
    period: view(period.start, period.end, period.start_date),
    previous_period: view(
      period.previous.start,
      period.previous.end,
      period.previous.start_date
    ),
    current,
    previous,
    deltas: comparePeriodReports(current, previous),
  }
}

export async function getPeriodReport(
  actor: AuthedUser,
  kind: string,
  date: string
): Promise<PeriodReportResult> {
  return periodReportForScope(
    scopedView(await resolveAnalyticsScope(actor), actor.uid),
    kind,
    date
  )
}

// SPEC §5.6 R4: the same report for the requested period and the one before it,
// plus the per-metric absolute + percentage change.
export async function getPeriodComparison(
  actor: AuthedUser,
  kind: string,
  date: string
): Promise<PeriodComparisonResult> {
  return periodComparisonForScope(
    scopedView(await resolveAnalyticsScope(actor), actor.uid),
    kind,
    date
  )
}
