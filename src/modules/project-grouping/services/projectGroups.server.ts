import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  isProjectGroupWritable,
  projectGroupCreateSchema,
  projectGroupLifecycleSchema,
  projectGroupUpdateSchema,
  type ProjectGroupLifecycle,
} from "@/lib/domain"
import { requireSystemManager } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// project-grouping change §2 — CRUD for ProjectGroup. Every operation is
// manager-only (design.md Decision 3, reusing requireSystemManager) and goes
// through firebase-admin; the client only reads.

export interface CreateProjectGroupResult {
  id: string
}

// task 2.1 — create a group. name required, description optional; lifecycle
// starts "active"; created_by comes from the verified auth context.
export async function createProjectGroup(
  actor: AuthedUser,
  body: unknown
): Promise<CreateProjectGroupResult> {
  requireSystemManager(actor)

  const input = parseOrThrow(projectGroupCreateSchema, body)
  const ref = getAdminDb().collection(COLLECTIONS.projectGroups).doc()

  await ref.set({
    ...input,
    lifecycle: "active",
    created_by: actor.uid,
    created_at: FieldValue.serverTimestamp(),
  })

  return { id: ref.id }
}

// task 2.2 — edit a group's name / description. Manager-only; an archived group
// is read-only (spec). lifecycle is never touched here (task 2.3 owns it).
export async function updateProjectGroup(
  actor: AuthedUser,
  groupId: string,
  body: unknown
): Promise<{ id: string }> {
  requireSystemManager(actor)

  const input = parseOrThrow(projectGroupUpdateSchema, body)
  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }

  const ref = getAdminDb().collection(COLLECTIONS.projectGroups).doc(groupId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpError(404, "Không tìm thấy nhóm")
  }
  if (!isProjectGroupWritable(snap.data()?.lifecycle as string | undefined)) {
    throw new HttpError(409, "Nhóm đã lưu trữ — chỉ đọc")
  }

  await ref.update(input)
  return { id: groupId }
}

// task 2.3 — archive a group or restore it. Manager-only. Archiving hides the
// group from the default project list (task 4.1) but changes NOTHING about its
// projects — they keep running (spec). No cascade.
export async function setProjectGroupLifecycle(
  actor: AuthedUser,
  groupId: string,
  body: unknown
): Promise<{ id: string; lifecycle: ProjectGroupLifecycle }> {
  requireSystemManager(actor)

  const { lifecycle: target } = parseOrThrow(projectGroupLifecycleSchema, body)

  const ref = getAdminDb().collection(COLLECTIONS.projectGroups).doc(groupId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpError(404, "Không tìm thấy nhóm")
  }

  const from = snap.data()?.lifecycle as ProjectGroupLifecycle | undefined
  if (from === target) {
    throw new HttpError(400, `Nhóm đã ở trạng thái "${target}"`)
  }

  await ref.update({ lifecycle: target })
  return { id: groupId, lifecycle: target }
}
