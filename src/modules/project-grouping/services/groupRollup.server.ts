import { COLLECTIONS } from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import {
  progressDashboardForScope,
  type ProgressDashboardResult,
} from "@/modules/analytics/services/dashboard.server"
import {
  periodComparisonForScope,
  periodReportForScope,
  type PeriodComparisonResult,
  type PeriodReportResult,
} from "@/modules/analytics/services/report.server"
import {
  resolveAnalyticsScope,
  type ScopedView,
} from "@/modules/analytics/services/scope.server"

// project-grouping change §5 — the group roll-up. Reuses the §1.4 aggregation
// cores; the only new work is resolving which of the group's child projects the
// viewer may roll up.

interface GroupScope {
  group: { id: string; name: string }
  /** the group's child projects that the viewer manages */
  visible_ids: string[]
  /** all child projects of the group */
  projects_total: number
  scope: ScopedView
}

// task 5.1 / 5.2 — the group's child projects ∩ the projects the viewer is a
// manager of (§5.6 R1: the dept-level view is manager-only, over managed
// projects). A viewer who manages nothing gets 403 — no dept view for staff.
async function resolveGroupScope(
  actor: AuthedUser,
  groupId: string
): Promise<GroupScope> {
  const db = getAdminDb()
  const groupSnap = await db
    .collection(COLLECTIONS.projectGroups)
    .doc(groupId)
    .get()
  if (!groupSnap.exists) {
    throw new HttpError(404, "Không tìm thấy nhóm")
  }

  const analyticsScope = await resolveAnalyticsScope(actor)
  if (analyticsScope.mode !== "manager") {
    throw new HttpError(403, "Chỉ Trưởng phòng xem được trang tổng hợp nhóm")
  }

  const childSnap = await db
    .collection(COLLECTIONS.projects)
    .where("group_id", "==", groupId)
    .get()
  const childIds = childSnap.docs.map((d) => d.id)
  const managed = new Set(analyticsScope.project_ids)
  const visible_ids = childIds.filter((id) => managed.has(id))

  return {
    group: { id: groupId, name: String(groupSnap.data()?.name ?? groupId) },
    visible_ids,
    projects_total: childIds.length,
    scope: { mode: "manager", project_ids: visible_ids, uid: actor.uid },
  }
}

interface GroupMeta {
  group: { id: string; name: string }
  /** how many child projects the numbers cover, of the group's total */
  projects_counted: number
  projects_total: number
  /** true when the group itself has no projects (≠ "no data in period") */
  group_empty: boolean
}

function meta(gs: GroupScope): GroupMeta {
  return {
    group: gs.group,
    projects_counted: gs.visible_ids.length,
    projects_total: gs.projects_total,
    group_empty: gs.projects_total === 0,
  }
}

export type GroupDashboardResult = ProgressDashboardResult & GroupMeta

export async function getGroupDashboard(
  actor: AuthedUser,
  groupId: string
): Promise<GroupDashboardResult> {
  const gs = await resolveGroupScope(actor, groupId)
  const dashboard = await progressDashboardForScope(gs.scope)
  return { ...dashboard, ...meta(gs) }
}

export type GroupPeriodReportResult = PeriodReportResult & GroupMeta

export async function getGroupPeriodReport(
  actor: AuthedUser,
  groupId: string,
  kind: string,
  date: string
): Promise<GroupPeriodReportResult> {
  const gs = await resolveGroupScope(actor, groupId)
  const report = await periodReportForScope(gs.scope, kind, date)
  return { ...report, ...meta(gs) }
}

export type GroupPeriodComparisonResult = PeriodComparisonResult & GroupMeta

export async function getGroupPeriodComparison(
  actor: AuthedUser,
  groupId: string,
  kind: string,
  date: string
): Promise<GroupPeriodComparisonResult> {
  const gs = await resolveGroupScope(actor, groupId)
  const comparison = await periodComparisonForScope(gs.scope, kind, date)
  return { ...comparison, ...meta(gs) }
}

export interface GroupReportPerProject extends GroupMeta {
  period: PeriodReportResult["period"]
  projects: Array<{ id: string; name: string; report: PeriodReportResult }>
}

// task 5.5 — the per-child-project breakdown the CSV export needs. One §5.6 R3
// report per visible child; NO group-total row (design Decision 6).
export async function getGroupReportPerProject(
  actor: AuthedUser,
  groupId: string,
  kind: string,
  date: string
): Promise<GroupReportPerProject> {
  const gs = await resolveGroupScope(actor, groupId)
  const db = getAdminDb()

  const projects = await Promise.all(
    gs.visible_ids.map(async (id) => {
      const [snap, report] = await Promise.all([
        db.collection(COLLECTIONS.projects).doc(id).get(),
        periodReportForScope(
          { mode: "manager", project_ids: [id], uid: gs.scope.uid },
          kind,
          date
        ),
      ])
      return { id, name: String(snap.data()?.name ?? id), report }
    })
  )

  // resolve the period even when the group is empty (for the CSV header)
  const period =
    projects[0]?.report.period ??
    (await periodReportForScope(
      { mode: "manager", project_ids: [], uid: gs.scope.uid },
      kind,
      date
    )).period

  return { ...meta(gs), period, projects }
}
