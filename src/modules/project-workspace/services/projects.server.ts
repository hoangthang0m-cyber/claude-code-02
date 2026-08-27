import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  canChangeLifecycle,
  isBackgroundSyncActive,
  isProjectWritable,
  projectCreateSchema,
  projectFormUpdateSchema,
  projectLifecycleSchema,
  type ProjectLifecycle,
} from "@/lib/domain"
import {
  requireProjectManager,
  requireProjectScope,
  requireSystemManager,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// Server-side project operations (SPEC §5.1). Route handlers under
// src/app/api/projects/ wrap these with getAuthedUser + errorResponse.

export interface CreateProjectResult {
  id: string
}

// SPEC §5.1 R1: create a project from the standard form. name + objective are
// required; the creator becomes a project manager; lifecycle starts "running".
export async function createProject(
  actor: AuthedUser,
  body: unknown
): Promise<CreateProjectResult> {
  requireSystemManager(actor)

  const input = parseOrThrow(projectCreateSchema, body)
  const db = getAdminDb()

  const projectRef = db.collection(COLLECTIONS.projects).doc()
  const memberRef = db.collection(COLLECTIONS.projectMembers).doc()

  const batch = db.batch()
  batch.set(projectRef, {
    ...input,
    lifecycle: "running",
    created_by: actor.uid,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  })
  // SPEC §5.1 R1: "gán người tạo là Trưởng phòng dự án".
  batch.set(memberRef, {
    project_id: projectRef.id,
    user_id: actor.uid,
    project_role: "manager",
    skill_tag: null,
  })
  await batch.commit()

  return { id: projectRef.id }
}

export interface UpdateProjectResult {
  id: string
  /** true when progress_sheet_url changed and the old sheet mapping was reset */
  sheet_mapping_reset: boolean
}

// SPEC §5.1 R2: the project's manager edits any form field after creation. Saves
// with updated_at + updated_by. Changing progress_sheet_url detaches the old
// Google Sheet mapping (the new mapping is set up in group 7.6).
export async function updateProject(
  actor: AuthedUser,
  projectId: string,
  body: unknown
): Promise<UpdateProjectResult> {
  const scope = await requireProjectScope(actor.uid, projectId)
  requireProjectManager(scope)

  const input = parseOrThrow(projectFormUpdateSchema, body)
  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }

  const db = getAdminDb()
  const ref = db.collection(COLLECTIONS.projects).doc(projectId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpError(404, "Không tìm thấy dự án")
  }

  const current = snap.data() ?? {}
  // SPEC §5.1 R3: an archived project is read-only.
  if (!isProjectWritable(current.lifecycle as ProjectLifecycle)) {
    throw new HttpError(409, "Dự án đã lưu trữ — chỉ đọc")
  }

  const sheetUrlChanged =
    input.progress_sheet_url !== undefined &&
    input.progress_sheet_url !== current.progress_sheet_url

  const batch = db.batch()
  batch.update(ref, {
    ...input,
    updated_at: FieldValue.serverTimestamp(),
    updated_by: actor.uid,
  })

  if (sheetUrlChanged) {
    const mappings = await db
      .collection(COLLECTIONS.sheetSyncMappings)
      .where("project_id", "==", projectId)
      .get()
    mappings.forEach((m) => batch.delete(m.ref))
  }

  await batch.commit()
  return { id: projectId, sheet_mapping_reset: sheetUrlChanged }
}

export interface ChangeLifecycleResult {
  id: string
  lifecycle: ProjectLifecycle
  /** SPEC §5.1 R3: prompt to fill the retrospective when completing */
  retrospective_reminder: boolean
  /** SPEC §5.1 R3 / §6.3: archiving stops background sync */
  background_sync_active: boolean
}

// SPEC §5.1 R3: move a project through running / done / archived. Only the
// project's manager. Archiving makes it read-only and stops background sync
// (the sync jobs filter on lifecycle).
export async function changeProjectLifecycle(
  actor: AuthedUser,
  projectId: string,
  body: unknown
): Promise<ChangeLifecycleResult> {
  const scope = await requireProjectScope(actor.uid, projectId)
  requireProjectManager(scope)

  const { lifecycle: target } = parseOrThrow(projectLifecycleSchema, body)

  const db = getAdminDb()
  const ref = db.collection(COLLECTIONS.projects).doc(projectId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpError(404, "Không tìm thấy dự án")
  }

  const current = snap.data() ?? {}
  const from = current.lifecycle as ProjectLifecycle

  if (from === target) {
    throw new HttpError(400, `Dự án đã ở trạng thái "${target}"`)
  }
  if (!canChangeLifecycle(from, target)) {
    throw new HttpError(409, `Không thể chuyển vòng đời "${from}" → "${target}"`)
  }

  await ref.update({
    lifecycle: target,
    updated_at: FieldValue.serverTimestamp(),
    updated_by: actor.uid,
  })

  return {
    id: projectId,
    lifecycle: target,
    retrospective_reminder: target === "done" && !current.retrospective,
    background_sync_active: isBackgroundSyncActive(target),
  }
}
