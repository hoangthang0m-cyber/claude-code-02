import {
  COLLECTIONS,
  computeReorder,
  isProjectGroupWritable,
  nextSortIndex,
  projectGroupAssignmentSchema,
  projectReorderSchema,
} from "@/lib/domain"
import { requireSystemManager } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// project-grouping change §3 — a project's membership of a group. Distinct from
// the group entity CRUD (§2, projectGroups.server.ts): here we only ever write
// `Project.group_id` (+ `sort_index` when the bucket changes or is reordered).

type Db = ReturnType<typeof getAdminDb>

// The projects in one bucket — a `group_id` value, or the group_id-less bucket.
// Firestore can't query "group_id missing", so the ungrouped bucket is found by
// scanning all projects (fine at the design's "vài chục dự án" scale — same
// in-memory approach as the analytics list endpoints).
async function bucketDocs(db: Db, bucket: string | null) {
  if (bucket === null) {
    return (await db.collection(COLLECTIONS.projects).get()).docs.filter(
      (d) => !d.data().group_id
    )
  }
  return (
    await db.collection(COLLECTIONS.projects).where("group_id", "==", bucket).get()
  ).docs
}

// task 3.2 — the sort_index that puts a project at the END of a bucket.
export async function endOfBucketSortIndex(
  db: Db,
  bucket: string | null,
  excludeProjectId?: string
): Promise<number> {
  const indices = (await bucketDocs(db, bucket))
    .filter((d) => d.id !== excludeProjectId)
    .map((d) => d.data().sort_index)
    .filter((s): s is number => typeof s === "number")

  return nextSortIndex(indices)
}

// task 3.1 / 3.3 — a group you may assign a project into must exist and not be
// archived. Shared by setProjectGroup and createProject (the create form's
// optional group picker).
export async function assertAssignableGroup(
  db: Db,
  groupId: string
): Promise<void> {
  const snap = await db.collection(COLLECTIONS.projectGroups).doc(groupId).get()
  if (!snap.exists) {
    throw new HttpError(404, "Không tìm thấy nhóm")
  }
  if (!isProjectGroupWritable(snap.data()?.lifecycle as string | undefined)) {
    throw new HttpError(409, "Nhóm đã lưu trữ — không thể gán dự án vào")
  }
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
    await assertAssignableGroup(db, group_id)
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

// task 4.5 — reorder a project within its OWN bucket: place it right after
// `after_id` (or at the front when null). `after_id` must be another project in
// the same bucket. Writes the midpoint sort_index, or re-spaces the whole
// bucket when no gap is left. Cross-bucket moves go through setProjectGroup.
export async function reorderProject(
  actor: AuthedUser,
  projectId: string,
  body: unknown
): Promise<{ id: string; updated: Array<{ id: string; sort_index: number }> }> {
  requireSystemManager(actor)

  const { after_id } = parseOrThrow(projectReorderSchema, body)
  if (after_id === projectId) {
    throw new HttpError(400, "after_id không thể là chính dự án đang di chuyển")
  }
  const db = getAdminDb()

  const projectSnap = await db.collection(COLLECTIONS.projects).doc(projectId).get()
  if (!projectSnap.exists) {
    throw new HttpError(404, "Không tìm thấy dự án")
  }
  const bucket = (projectSnap.data()?.group_id ?? null) as string | null

  const docs = await bucketDocs(db, bucket)
  const ids = new Set(docs.map((d) => d.id))
  if (!ids.has(projectId)) {
    // scan/where race — project not in the bucket we just read
    throw new HttpError(409, "Dự án không còn trong rổ này — thử lại")
  }
  if (after_id !== null && !ids.has(after_id)) {
    throw new HttpError(400, "after_id không thuộc cùng rổ với dự án")
  }

  const writes = computeReorder(
    docs.map((d) => ({ id: d.id, sort_index: d.data().sort_index })),
    projectId,
    after_id
  )

  if (writes.size > 0) {
    const batch = db.batch()
    for (const [id, sort_index] of writes) {
      batch.update(db.collection(COLLECTIONS.projects).doc(id), { sort_index })
    }
    await batch.commit()
  }

  return {
    id: projectId,
    updated: [...writes].map(([id, sort_index]) => ({ id, sort_index })),
  }
}
