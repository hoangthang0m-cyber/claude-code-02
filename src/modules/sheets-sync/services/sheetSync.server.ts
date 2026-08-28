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
  syncSystemToSheet,
  type SheetPushResult,
} from "@/modules/sheets-sync/services/sheetPush.server"

// SPEC §5.5 R2, task 6.3: run one two-way sync for a project. Task 6.3 wires the
// system → sheet direction; task 6.4 adds sheet → system to the same entry
// point, task 6.6 the conflict handling.

export interface SheetSyncResult {
  push: SheetPushResult
}

interface MappingDoc {
  spreadsheet_id: string
  sheet_tab: string
  header_row: number
  column_map: Record<string, string>
  owner_uid: string
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
    owner_uid: ownerUid,
  }
}

async function runSync(projectId: string): Promise<SheetSyncResult> {
  const mapping = await loadMapping(projectId)
  const db = getAdminDb()
  const startedAt = Timestamp.now()

  let push: SheetPushResult
  let error: string | null = null
  try {
    const token = await getGoogleAccessToken(mapping.owner_uid)
    push = await syncSystemToSheet(projectId, mapping, token)
  } catch (e) {
    push = { rows_matched: 0, cells_written: 0 }
    error = e instanceof HttpError ? e.message : "Đồng bộ thất bại"
  }

  await db.collection(COLLECTIONS.syncRuns).doc().set({
    project_id: projectId,
    kind: "sheets",
    started_at: startedAt,
    finished_at: FieldValue.serverTimestamp(),
    result: error ? "error" : "ok",
    rows_read: 0,
    rows_written: push.cells_written,
    message:
      error ??
      `Ghi ${push.cells_written} ô xuống sheet (${push.rows_matched} dòng khớp)`,
  })

  if (error) throw new HttpError(502, error)
  return { push }
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
