import {
  COLLECTIONS,
  isProjectGroupWritable,
  nextSortIndex,
  projectGroupAssignmentSchema,
} from "@/lib/domain"
import { requireSystemManager } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// project-grouping change §3 — a project's membership of a group. Distinct from
// the group entity CRUD (§2, projectGroups.server.ts): here we only ever write
// `Project.group_id` (+ `sort_index` when the bucket changes).

type Db = ReturnType<typeof getAdminDb>

// task 3.2 — the sort_index that puts a project at the END of a bucket. A bucket
// is one `group_id` value, or the group_id-less bucket. Firestore can't query
// "group_id missing", so the ungrouped bucket is found by scanning all projects
// (fine at the design's "vài chục dự án" scale — same in-memory approach as the
// analytics list endpoints).
export async function endOfBucketSortIndex(
  db: Db,
  bucket: string | null,
  excludeProjectId?: string
): Promise<number> {
  const docs =
    bucket === null
      ? (await db.collection(COLLECTIONS.projects).get()).docs.filter(
          (d) => !d.data().group_id
        )
      : (
          await db
            .collection(COLLECTIONS.projects)
            .where("group_id", "==", bucket)
            .get()
        ).docs

  const indices = docs
    .filter((d) => d.id !== excludeProjectId)
    .map((d) => d.data().sort_index)
    .filter((s): s is number => typeof s === "number")

  return nextSortIndex(indices)
}

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
): Promise<{ id: string; group_id: string | null; sort_index?: number }> {
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

  const currentBucket = (projectSnap.data()?.group_id ?? null) as string | null
  const patch: { group_id: string | null; sort_index?: number } = { group_id }

  // task 3.2 — only when the bucket actually changes: drop the project at the
  // end of the new bucket. Re-assigning to the current group keeps its order.
  if (currentBucket !== group_id) {
    patch.sort_index = await endOfBucketSortIndex(db, group_id, projectId)
  }

  await projectRef.update(patch)
  return { id: projectId, ...patch }
}
