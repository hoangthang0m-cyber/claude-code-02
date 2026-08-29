import {
  COLLECTIONS,
  CONTENT_STATUSES,
  isOverdue,
  type ContentStatus,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import {
  chunkedIn,
  resolveAnalyticsScope,
} from "@/modules/analytics/services/scope.server"

// SPEC §5.6 R2, task 8.6: clicking a person on the dashboard opens the list of
// their content items (with a status filter). Scoped like the rest of the
// analytics — a manager can drill into anyone on their projects; anyone else
// only into themselves.

export interface PersonItemRow {
  id: string
  code: string
  status: ContentStatus
  project_id: string
  deadline: number | null
  is_overdue: boolean
}

function tsMs(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : null
}

export async function getPersonItems(
  actor: AuthedUser,
  userId: string,
  status?: string
): Promise<{ items: PersonItemRow[] }> {
  const scope = await resolveAnalyticsScope(actor)
  if (scope.mode === "staff" && userId !== actor.uid) {
    throw new HttpError(403, "Nhân sự chỉ xem được hạng mục của mình")
  }
  if (scope.project_ids.length === 0) return { items: [] }

  const statusFilter =
    status && (CONTENT_STATUSES as readonly string[]).includes(status)
      ? (status as ContentStatus)
      : null

  const docs = await chunkedIn(scope.project_ids, async (batch) => {
    const snap = await getAdminDb()
      .collection(COLLECTIONS.contentItems)
      .where("project_id", "in", batch)
      .get()
    return snap.docs
  })

  const now = Date.now()
  const items = docs
    .filter((d) => d.data().assignee_id === userId)
    .map((d) => {
      const data = d.data()
      const s = data.status as ContentStatus
      const deadline = tsMs(data.deadline)
      return {
        id: d.id,
        code: String(data.code ?? d.id),
        status: s,
        project_id: String(data.project_id ?? ""),
        deadline,
        is_overdue: isOverdue(deadline, s, now),
      }
    })
    .filter((i) => (statusFilter ? i.status === statusFilter : true))
    .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity))

  return { items }
}
