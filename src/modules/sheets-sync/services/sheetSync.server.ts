import { FieldValue, Timestamp } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  isBackgroundSyncActive,
  type ProjectLifecycle,
  type SyncKind,
  type SyncResult,
} from "@/lib/domain"
import {
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import {
  projectManagerUids,
  queueNotification,
} from "@/modules/notifications/services/notify.server"
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
  sync_enabled: boolean
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
    sync_enabled: d.sync_enabled !== false,
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

// A failure that will not fix itself on the next run — the manager must re-grant
// Google access. The job pauses itself and notifies them (SPEC §5.5 R4).
function isAccessLost(e: unknown): boolean {
  return e instanceof HttpError && [401, 403, 409].includes(e.status)
}

async function runSync(projectId: string): Promise<SheetSyncResult> {
  const mapping = await loadMapping(projectId)
  const db = getAdminDb()

  // task 6.9: a paused project runs no sync at all, in either direction.
  if (!mapping.sync_enabled) {
    throw new HttpError(409, "Đồng bộ Google Sheets đang tắt cho dự án này")
  }

  const startedAt = Timestamp.now()

  let pull: SheetPullResult = EMPTY_PULL
  let push: SheetPushResult = { rows_matched: 0, cells_written: 0 }
  let error: string | null = null
  let accessLost = false

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
    accessLost = isAccessLost(e)
  }

  // SPEC §5.5 R4: lost sheet access → pause the job, notify the managers so they
  // can re-grant it. No data is touched on either side.
  if (accessLost) {
    const batch = db.batch()
    batch.set(
      db.collection(COLLECTIONS.sheetSyncMappings).doc(projectId),
      {
        sync_enabled: false,
        sync_disabled_reason: "permission_lost",
        sync_disabled_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    for (const uid of await projectManagerUids(db, projectId)) {
      queueNotification(db, batch, {
        recipient_id: uid,
        type: "sync_issue",
        project_id: projectId,
        message:
          "Mất quyền truy cập Google Sheet — đã tạm dừng đồng bộ. Cấp lại quyền rồi bật lại trong cấu hình dự án.",
      })
    }
    await batch.commit()
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

// Background cron entry (SPEC §5.5 R2: ≤ 5 min). Task 6.8: only a `running`
// project is synced in the background — a `done` / `archived` project keeps its
// mapping but its sheet is left alone until it reopens (§5.1 R3).
export async function syncAllProjectSheets(): Promise<{
  projects: number
  ok: number
  errors: number
  skipped: number
}> {
  const db = getAdminDb()
  const mappings = await db.collection(COLLECTIONS.sheetSyncMappings).get()
  let ok = 0
  let errors = 0
  let skipped = 0
  for (const m of mappings.docs) {
    // task 6.9: a manager paused it, or a previous run lost sheet access
    if (m.data()?.sync_enabled === false) {
      skipped++
      continue
    }
    const proj = await db.collection(COLLECTIONS.projects).doc(m.id).get()
    const lifecycle = (proj.data()?.lifecycle as ProjectLifecycle) ?? "running"
    if (!isBackgroundSyncActive(lifecycle)) {
      skipped++
      continue
    }
    try {
      await runSync(m.id)
      ok++
    } catch {
      errors++
    }
  }
  return { projects: mappings.size, ok, errors, skipped }
}

// ── Sync status + log screen (SPEC §5.5 R3 / R4, task 6.8) ──────────────────

export interface SyncRunView {
  id: string
  kind: SyncKind
  started_at: number | null
  finished_at: number | null
  result: SyncResult | null
  rows_read: number
  rows_written: number
  message: string | null
}

export interface SyncConflictView {
  id: string
  content_item_id: string
  field: string
  system_value: string
  sheet_value: string
  chosen_side: string
  created_at: number | null
}

export interface SheetSyncLog {
  configured: boolean
  sync_enabled: boolean
  sync_disabled_reason: "manual" | "permission_lost" | null
  last_run: SyncRunView | null
  runs: SyncRunView[]
  conflicts: SyncConflictView[]
}

function toMillis(t: unknown): number | null {
  const v = t as { toMillis?: () => number } | null
  return typeof v?.toMillis === "function" ? v.toMillis() : null
}

// Any project member may read the log (R4 frames it as a per-project status
// panel, not a manager-only action). Sorted + capped in memory, like the rest
// of the project's list endpoints, to avoid a composite index.
export async function getProjectSheetSyncLog(
  actor: AuthedUser,
  projectId: string
): Promise<SheetSyncLog> {
  await requireProjectScope(actor.uid, projectId)
  const db = getAdminDb()

  const [mapping, runsSnap, conflictsSnap] = await Promise.all([
    db.collection(COLLECTIONS.sheetSyncMappings).doc(projectId).get(),
    db.collection(COLLECTIONS.syncRuns).where("project_id", "==", projectId).get(),
    db
      .collection(COLLECTIONS.syncConflicts)
      .where("project_id", "==", projectId)
      .get(),
  ])

  const runs: SyncRunView[] = runsSnap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        kind: (x.kind as SyncKind) ?? "sheets",
        started_at: toMillis(x.started_at),
        finished_at: toMillis(x.finished_at),
        result: (x.result as SyncResult) ?? null,
        rows_read: Number(x.rows_read ?? 0),
        rows_written: Number(x.rows_written ?? 0),
        message: (x.message as string) ?? null,
      }
    })
    .filter((r) => r.kind === "sheets")
    .sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0))
    .slice(0, 20)

  const conflicts: SyncConflictView[] = conflictsSnap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        content_item_id: String(x.content_item_id ?? ""),
        field: String(x.field ?? ""),
        system_value: String(x.system_value ?? ""),
        sheet_value: String(x.sheet_value ?? ""),
        chosen_side: String(x.chosen_side ?? ""),
        created_at: toMillis(x.created_at),
      }
    })
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
    .slice(0, 20)

  const md = mapping.data() ?? {}
  return {
    configured: mapping.exists,
    sync_enabled: md.sync_enabled !== false,
    sync_disabled_reason:
      (md.sync_disabled_reason as "manual" | "permission_lost") ?? null,
    last_run: runs[0] ?? null,
    runs,
    conflicts,
  }
}
