import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  canChangeLifecycle,
  isBackgroundSyncActive,
  isProjectWritable,
  projectCreateSchema,
  projectDeleteSchema,
  projectFormUpdateSchema,
  projectLifecycleSchema,
  projectMemberDocId,
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
import {
  assertAssignableGroup,
  endOfBucketSortIndex,
} from "@/modules/project-grouping/services/projectAssignment.server"

// Server-side project operations (SPEC §5.1). Route handlers under
// src/app/api/projects/ wrap these with getAuthedUser + errorResponse.

export interface CreateProjectResult {
  id: string
}

// SPEC §5.1 R1: create a project from the standard form. name + objective are
// required; the creator becomes a project manager; lifecycle starts "running".
// project-grouping task 3.3: an optional `group_id` files the project into a
// group (must exist + not be archived); it lands at the end of that bucket, or
// the end of the ungrouped bucket when omitted.
export async function createProject(
  actor: AuthedUser,
  body: unknown
): Promise<CreateProjectResult> {
  requireSystemManager(actor)

  const input = parseOrThrow(projectCreateSchema, body)
  const db = getAdminDb()

  const bucket = input.group_id ?? null
  if (bucket !== null) {
    await assertAssignableGroup(db, bucket)
  }
  const sort_index = await endOfBucketSortIndex(db, bucket)

  const projectRef = db.collection(COLLECTIONS.projects).doc()
  const memberRef = db
    .collection(COLLECTIONS.projectMembers)
    .doc(projectMemberDocId(projectRef.id, actor.uid))

  const batch = db.batch()
  batch.set(projectRef, {
    ...input,
    lifecycle: "running",
    sort_index,
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

// ── Hard delete (user-approved 2026-09-04; NOT in SPEC.md) ──────────────────

export interface DeleteProjectResult {
  id: string
  docs_deleted: number
  content_items_deleted: number
}

type AnyRef = { path: string; delete: () => unknown }

// Delete a project and cascade every child doc: its members, its content items
// and each item's status history / comments / ads bindings / ads metrics, plus
// the project's sheet mappings / sync runs / sync conflicts / notifications.
// Per-manager stores (adAccountConnections, googleConnections) are NOT touched.
// Project-manager only; the caller must echo the project name.
export async function deleteProject(
  actor: AuthedUser,
  projectId: string,
  body: unknown
): Promise<DeleteProjectResult> {
  const scope = await requireProjectScope(actor.uid, projectId)
  requireProjectManager(scope)

  const { confirm_name } = parseOrThrow(projectDeleteSchema, body)
  const db = getAdminDb()

  const projectRef = db.collection(COLLECTIONS.projects).doc(projectId)
  const projectSnap = await projectRef.get()
  if (!projectSnap.exists) {
    throw new HttpError(404, "Không tìm thấy dự án")
  }
  if (String(projectSnap.data()?.name ?? "").trim() !== confirm_name.trim()) {
    throw new HttpError(400, "Tên xác nhận không khớp tên dự án")
  }

  const byPath = new Map<string, AnyRef>()
  const add = (refs: AnyRef[]) => refs.forEach((r) => byPath.set(r.path, r))

  const byField = async (col: string, field: string, value: string) =>
    (await db.collection(col).where(field, "==", value).get()).docs.map(
      (d) => d.ref as AnyRef
    )
  const byFieldIn = async (col: string, field: string, values: string[]) => {
    const out: AnyRef[] = []
    for (let i = 0; i < values.length; i += 30) {
      const snap = await db
        .collection(col)
        .where(field, "in", values.slice(i, i + 30))
        .get()
      out.push(...snap.docs.map((d) => d.ref as AnyRef))
    }
    return out
  }

  const itemsSnap = await db
    .collection(COLLECTIONS.contentItems)
    .where("project_id", "==", projectId)
    .get()
  const itemIds = itemsSnap.docs.map((d) => d.id)
  add(itemsSnap.docs.map((d) => d.ref as AnyRef))

  add(await byField(COLLECTIONS.projectMembers, "project_id", projectId))
  add(await byField(COLLECTIONS.sheetSyncMappings, "project_id", projectId))
  add(await byField(COLLECTIONS.syncRuns, "project_id", projectId))
  add(await byField(COLLECTIONS.syncConflicts, "project_id", projectId))
  add(await byField(COLLECTIONS.notifications, "project_id", projectId))

  if (itemIds.length > 0) {
    for (const col of [
      COLLECTIONS.statusHistory,
      COLLECTIONS.comments,
      COLLECTIONS.adsBindings,
      COLLECTIONS.adsMetrics,
      COLLECTIONS.syncConflicts,
      COLLECTIONS.notifications,
    ]) {
      add(await byFieldIn(col, "content_item_id", itemIds))
    }
  }

  // the project doc itself goes last, so a partway failure leaves it retryable
  add([projectRef as AnyRef])

  const refs = [...byPath.values()]
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch()
    for (const r of refs.slice(i, i + 450)) {
      batch.delete(r as never)
    }
    await batch.commit()
  }

  return {
    id: projectId,
    docs_deleted: refs.length,
    content_items_deleted: itemIds.length,
  }
}
