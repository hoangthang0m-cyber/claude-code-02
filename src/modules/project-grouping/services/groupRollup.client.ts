import { authedJson } from "@/lib/api/authedFetch"
import type { ComparedMetric, MetricDelta, PeriodReport } from "@/lib/domain"
import type { ReportKind } from "@/modules/analytics/services/analytics.client"

// Client wrappers for the group roll-up APIs (project-grouping change §5).

interface GroupMeta {
  group: { id: string; name: string }
  projects_counted: number
  projects_total: number
  group_empty: boolean
}

interface PeriodView {
  kind: ReportKind
  start: number
  end: number
  start_date: string
}

export type GroupDashboardResult = GroupMeta & {
  total: number
  in_production: number
  pending_review: number
  overdue: number
  published: number
  ads_running: number
  project_ids: string[]
}

export type GroupReportResult = GroupMeta &
  PeriodReport & { period: PeriodView }

export type GroupComparisonResult = GroupMeta & {
  period: PeriodView
  previous_period: PeriodView
  current: PeriodReport
  previous: PeriodReport
  deltas: Record<ComparedMetric, MetricDelta>
}

export function getGroupDashboard(groupId: string) {
  return authedJson<GroupDashboardResult>(
    `/api/project-groups/${groupId}/dashboard`
  )
}

export function getGroupReport(groupId: string, kind: ReportKind, date: string) {
  return authedJson<GroupReportResult>(
    `/api/project-groups/${groupId}/report?period=${kind}&date=${date}`
  )
}

export function getGroupComparison(
  groupId: string,
  kind: ReportKind,
  date: string
) {
  return authedJson<GroupComparisonResult>(
    `/api/project-groups/${groupId}/report?period=${kind}&date=${date}&compare=1`
  )
}

export function groupReportCsvUrl(
  groupId: string,
  kind: ReportKind,
  date: string
) {
  return `/api/project-groups/${groupId}/report?period=${kind}&date=${date}&format=csv`
}
