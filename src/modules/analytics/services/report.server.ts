import {
  COLLECTIONS,
  computePeriodReport,
  resolveReportPeriod,
  type ContentStatus,
  type PeriodReport,
  type ReportCohortItem,
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
} from "@/modules/analytics/services/scope.server"

// SPEC §5.6 R3, task 8.3: the weekly / monthly overview report. The period is
// resolved server-side in Asia/Ho_Chi_Minh with a Monday week start (§8 Q4).

export interface PeriodReportResult extends PeriodReport {
  mode: "manager" | "staff"
  period: { kind: ReportPeriodKind; start: number; end: number; start_date: string }
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

export async function getPeriodReport(
  actor: AuthedUser,
  kind: string,
  date: string
): Promise<PeriodReportResult> {
  if (kind !== "week" && kind !== "month") {
    throw new HttpError(400, "period phải là 'week' hoặc 'month'")
  }
  let period
  try {
    period = resolveReportPeriod(kind, date)
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Ngày không hợp lệ")
  }

  const db = getAdminDb()
  const { mode, project_ids: scopeProjects } = await resolveAnalyticsScope(actor)

  const emptyResult = (): PeriodReportResult => ({
    ...computePeriodReport([], 0),
    mode,
    period: {
      kind,
      start: period.start,
      end: period.end,
      start_date: period.start_date,
    },
  })

  if (scopeProjects.length === 0) return emptyResult()

  const itemDocs = await chunkedIn(scopeProjects, async (batch) => {
    const snap = await db
      .collection(COLLECTIONS.contentItems)
      .where("project_id", "in", batch)
      .get()
    return snap.docs
  })
  const items = itemDocs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((i) =>
      mode === "manager" ? true : i.data.assignee_id === actor.uid
    )
  if (items.length === 0) return emptyResult()

  // history for those items → who hit da_len_ads in the period, and how many
  // return transitions happened in the period
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
    if (at == null) continue
    const inPeriod = at >= period.start && at < period.end
    if (d.to_status === "da_len_ads" && inPeriod) {
      const id = String(d.content_item_id ?? "")
      const prev = publishedMs.get(id)
      if (prev == null || at < prev) publishedMs.set(id, at)
    }
    if (inPeriod && isReturn(d.from_status, d.to_status)) returnsInPeriod++
  }

  const cohortItems = items.filter((i) => publishedMs.has(i.id))
  if (cohortItems.length === 0) {
    return {
      ...computePeriodReport([], returnsInPeriod),
      mode,
      period: {
        kind,
        start: period.start,
        end: period.end,
        start_date: period.start_date,
      },
    }
  }

  // current ads metric per cohort item
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
        ? {
            spend: current.spend,
            messages: current.messages,
            roas: current.roas,
          }
        : null,
    }
  })

  return {
    ...computePeriodReport(cohort, returnsInPeriod),
    mode,
    period: {
      kind,
      start: period.start,
      end: period.end,
      start_date: period.start_date,
    },
  }
}
