import {
  COLLECTIONS,
  isProjectGroupWritable,
  projectGroupAssignmentSchema,
} from "@/lib/domain"
import { requireSystemManager } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// project-grouping change §3 — a project's membership of a group. Distinct from
// the group entity CRUD (§2, projectGroups.server.ts): here we only ever write
// `Project.group_id`.

// task 3.1 — assign a project to a group, move it, or clear it. Manager-only
// (design Decision 3). `group_id` is a scalar, so "no two groups" and
// "A no longer contains it after A→B" hold structurally. Group assignment is an
// organizational action, not a form edit — it is allowed regardless of the
// project's lifecycle (a `done` / `archived` project can still be filed so its
// history rolls up under the group).
export async function setProjectGroup(
  actor: AuthedUser,
  projectId: string,
  body: unknown
): Promise<{ id: string; group_id: string | null }> {
  requireSystemManager(actor)

  const { group_id } = parseOrThrow(projectGroupAssignmentSchema, body)
  const db = getAdminDb()

  const projectRef = db.collection(COLLECTIONS.projects).doc(projectId)
  const projectSnap = await projectRef.get()
  if (!projectSnap.exists) {
    throw new HttpError(404, "Không tìm thấy dự án")
  }

  if (group_id !== null) {
    const groupSnap = await db
      .collection(COLLECTIONS.projectGroups)
      .doc(group_id)
      .get()
    if (!groupSnap.exists) {
      throw new HttpError(404, "Không tìm thấy nhóm")
    }
    if (!isProjectGroupWritable(groupSnap.data()?.lifecycle as string | undefined)) {
      throw new HttpError(409, "Nhóm đã lưu trữ — không thể gán dự án vào")
    }
  }

  await projectRef.update({ group_id })
  return { id: projectId, group_id }
}
