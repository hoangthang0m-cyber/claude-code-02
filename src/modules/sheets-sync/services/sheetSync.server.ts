import { FieldValue, Timestamp } from "firebase-admin/firestore"

import { COLLECTIONS } from "@/lib/domain"
import {
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { getGoogleAccessToken } from "@/modules/sheets-sync/services/googleConnection.server"
import {
  captureSnapshot,
  runDeltaSheetSync,
  type SheetPullResult,
} from "@/modules/sheets-sync/services/sheetPull.server"
import {
  syncSystemToSheet,
  type SheetPushResult,
} from "@/modules/sheets-sync/services/sheetPush.server"
import type { SheetSnapshot } from "@/modules/sheets-sync/services/sheetRows"

// SPEC §5.5 R2: run one two-way sync for a project. sheet → system (delta vs
// snapshot, task 6.4) runs first, then system → sheet (task 6.3); the snapshot
// is re-captured after. Same-field conflict handling is task 6.6.

export interface SheetSyncResult {
  pull: SheetPullResult
  push: SheetPushResult
}

interface MappingDoc {
  spreadsheet_id: string
  sheet_tab: string
  header_row: number
  column_map: Record<string, string>
  conflict_rule: "system_wins" | "sheet_wins"
  owner_uid: string
  snapshot: SheetSnapshot
}

async function loadMapping(projectId: string): Promise<MappingDoc> {
  const db = getAdminDb()
  const snap = await db.collection(COLLECTIONS.sheetSyncMappings).doc(projectId).get()
  if (!snap.exists) {
    throw new HttpError(409, "Dự án chưa cấu hình đồng bộ Google Sheets")
  }
  const d = snap.data() ?? {}

  // the sheet is accessed with a project manager's Google token
  const managers = await db
    .collection(COLLECTIONS.projectMembers)
    .where("project_id", "==", projectId)
    .where("project_role", "==", "manager")
    .get()
  const ownerUid = managers.docs
    .map((m) => String(m.data().user_id ?? ""))
    .find(Boolean)
  if (!ownerUid) {
    throw new HttpError(409, "Dự án không còn Trưởng phòng để đồng bộ")
  }

  return {
    spreadsheet_id: String(d.spreadsheet_id ?? ""),
    sheet_tab: String(d.sheet_tab ?? ""),
    header_row: Number(d.header_row ?? 1),
    column_map: (d.column_map ?? {}) as Record<string, string>,
    conflict_rule: d.conflict_rule === "sheet_wins" ? "sheet_wins" : "system_wins",
    owner_uid: ownerUid,
    snapshot: (d.snapshot ?? {}) as SheetSnapshot,
  }
}

const EMPTY_PULL: SheetPullResult = {
  rows_read: 0,
  created: 0,
  updated: 0,
  mapping_errors: 0,
  conflicts: 0,
  unlinked: 0,
  messages: [],
}

async function runSync(projectId: string): Promise<SheetSyncResult> {
  const mapping = await loadMapping(projectId)
  const db = getAdminDb()
  const startedAt = Timestamp.now()

  let pull: SheetPullResult = EMPTY_PULL
  let push: SheetPushResult = { rows_matched: 0, cells_written: 0 }
  let error: string | null = null

  try {
    const token = await getGoogleAccessToken(mapping.owner_uid)
    // 1. sheet → system (delta vs the last snapshot)
    ;({ result: pull } = await runDeltaSheetSync(
      projectId,
      mapping,
      token,
      mapping.snapshot
    ))
    // 2. system → sheet
    push = await syncSystemToSheet(projectId, mapping, token)
    // 3. persist the post-sync snapshot
    const snapshot = await captureSnapshot(token, mapping)
    await db
      .collection(COLLECTIONS.sheetSyncMappings)
      .doc(projectId)
      .set({ snapshot }, { merge: true })
  } catch (e) {
    error = e instanceof HttpError ? e.message : "Đồng bộ thất bại"
  }

  const hasWarnings =
    pull.mapping_errors > 0 || pull.conflicts > 0 || pull.unlinked > 0
  await db.collection(COLLECTIONS.syncRuns).doc().set({
    project_id: projectId,
    kind: "sheets",
    started_at: startedAt,
    finished_at: FieldValue.serverTimestamp(),
    result: error ? "error" : hasWarnings ? "warning" : "ok",
    rows_read: pull.rows_read,
    rows_written: pull.created + pull.updated + push.cells_written,
    message:
      error ??
      `Sheet→hệ thống: ${pull.created} tạo, ${pull.updated} cập nhật` +
        (pull.conflicts ? `, ${pull.conflicts} xung đột` : "") +
        (pull.unlinked ? `, ${pull.unlinked} mất liên kết` : "") +
        (pull.mapping_errors ? `, ${pull.mapping_errors} lỗi ánh xạ` : "") +
        `. Hệ thống→sheet: ${push.cells_written} ô.`,
  })

  if (error) throw new HttpError(502, error)
  return { pull, push }
}

// Manual "đồng bộ ngay" (SPEC §5.5 R2). Manager only.
export async function syncProjectSheetNow(
  actor: AuthedUser,
  projectId: string
): Promise<SheetSyncResult> {
  const scope = await requireProjectScope(actor.uid, projectId)
  requireProjectManager(scope)
  return runSync(projectId)
}

// Background cron entry (SPEC §5.5 R2: ≤ 5 min). Runs for every project that has
// a mapping.
export async function syncAllProjectSheets(): Promise<{
  projects: number
  ok: number
  errors: number
}> {
  const db = getAdminDb()
  const mappings = await db.collection(COLLECTIONS.sheetSyncMappings).get()
  let ok = 0
  let errors = 0
  for (const m of mappings.docs) {
    try {
      await runSync(m.id)
      ok++
    } catch {
      errors++
    }
  }
  return { projects: mappings.size, ok, errors }
}
