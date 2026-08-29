import { FieldValue } from "firebase-admin/firestore"

import { CONTENT_STATUSES, COLLECTIONS } from "@/lib/domain"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import {
  projectManagerUids,
  queueNotification,
} from "@/modules/notifications/services/notify.server"
import { memberNameMap } from "@/modules/sheets-sync/services/sheetMapping.server"
import {
  readMappedSheet,
  resolveField,
  snapshotOf,
  systemFieldValue,
  type MappedSheetConfig,
  type SheetSnapshot,
} from "@/modules/sheets-sync/services/sheetRows"

// SPEC §5.5 R2 / R3 / §6.3, tasks 6.4 / 6.6 / 6.7: the sheet → system direction,
// delta-driven. Reads the whole sheet, diffs it against the snapshot from the
// previous sync, applies only the changed cells, and:
//  - same field changed on BOTH sides → apply `conflict_rule` + log
//    `SyncConflict` (task 6.6)
//  - a previously-synced row now missing from the sheet → keep the ContentItem,
//    null its `sheet_row_ref`, stamp `sheet_unlinked_at`, notify the project
//    managers (task 6.7)
// New rows become new ContentItems; invalid enum values are skipped per-field
// with a warning (SPEC §5.5 R1).

const SYNC_ACTOR = "sheet-sync"

export interface SheetPullResult {
  rows_read: number
  created: number
  updated: number
  mapping_errors: number
  conflicts: number
  unlinked: number
  messages: string[]
}

export async function runDeltaSheetSync(
  projectId: string,
  cfg: MappedSheetConfig,
  accessToken: string,
  prevSnapshot: SheetSnapshot
): Promise<{ result: SheetPullResult; snapshot: SheetSnapshot }> {
  const db = getAdminDb()
  const result: SheetPullResult = {
    rows_read: 0,
    created: 0,
    updated: 0,
    mapping_errors: 0,
    conflicts: 0,
    unlinked: 0,
    messages: [],
  }
  const sheetWins = cfg.conflict_rule === "sheet_wins"

  const ctx = await readMappedSheet(accessToken, cfg)
  if (ctx.codeCol < 0) return { result, snapshot: {} }

  const current = snapshotOf(ctx, cfg)
  result.rows_read = Object.keys(current).length

  const [existing, nameToUid] = await Promise.all([
    db.collection(COLLECTIONS.contentItems).where("project_id", "==", projectId).get(),
    memberNameMap(db, projectId),
  ])
  const itemByCode = new Map<
    string,
    { id: string; data: Record<string, unknown> }
  >()
  for (const d of existing.docs) {
    const c = String(d.data().code ?? "").trim()
    if (c) itemByCode.set(c, { id: d.id, data: d.data() })
  }

  const batch = db.batch()
  let ops = 0

  const resolveInto = (
    patch: Record<string, unknown>,
    code: string,
    field: string,
    cell: string
  ): boolean => {
    const r = resolveField(field, cell, nameToUid)
    if (r.ok) {
      Object.assign(patch, r.patch)
      return true
    }
    result.mapping_errors++
    result.messages.push(`${code}: ${r.message}, bỏ qua`)
    return false
  }

  for (const [code, fields] of Object.entries(current)) {
    const existingItem = itemByCode.get(code)

    // ── brand-new sheet row → create a ContentItem (SPEC §5.5 R2) ──
    if (!existingItem) {
      const patch: Record<string, unknown> = {}
      for (const [field, cell] of Object.entries(fields)) {
        if (cell) resolveInto(patch, code, field, cell)
      }
      batch.set(db.collection(COLLECTIONS.contentItems).doc(), {
        project_id: projectId,
        code,
        status: patch.status ?? CONTENT_STATUSES[0],
        sheet_row_ref: code,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        updated_by: SYNC_ACTOR,
        ...patch,
      })
      result.created++
      ops++
      continue
    }

    // ── existing item — per field: was it changed on the sheet? on the system? ──
    const prev = prevSnapshot[code] ?? {}
    const patch: Record<string, unknown> = {}
    let touched = false

    for (const [field, sheetCell] of Object.entries(fields)) {
      const base = prev[field] ?? ""
      const sheetChanged = sheetCell !== base
      const systemVal = systemFieldValue(field, existingItem.data, nameToUid)
      const systemChanged = systemVal !== base

      if (sheetChanged && systemChanged && sheetCell !== systemVal) {
        // SPEC §5.5 R3 — same field, both sides, conflicting values
        result.conflicts++
        batch.set(db.collection(COLLECTIONS.syncConflicts).doc(), {
          project_id: projectId,
          content_item_id: existingItem.id,
          field,
          system_value: systemVal,
          sheet_value: sheetCell,
          chosen_side: sheetWins ? "sheet" : "system",
          created_at: FieldValue.serverTimestamp(),
        })
        ops++
        if (sheetWins && resolveInto(patch, code, field, sheetCell)) touched = true
        // system_wins → keep the system value; the push writes it back down
        continue
      }

      if (sheetChanged) {
        if (resolveInto(patch, code, field, sheetCell)) touched = true
      }
    }

    // re-link a row that had been marked "lost" and is now back in the sheet
    const needsRelink = existingItem.data.sheet_row_ref !== code
    if (touched || needsRelink) {
      batch.update(db.collection(COLLECTIONS.contentItems).doc(existingItem.id), {
        ...patch,
        sheet_row_ref: code,
        ...(needsRelink ? { sheet_unlinked_at: null } : {}),
        updated_at: FieldValue.serverTimestamp(),
        updated_by: SYNC_ACTOR,
      })
      if (touched) result.updated++
      ops++
    }
  }

  // ── rows that were synced last time but are now gone from the sheet
  //    (SPEC §5.5 R2 / §6.3, task 6.7) ──
  const missing = Object.keys(prevSnapshot).filter(
    (code) =>
      !(code in current) &&
      itemByCode.get(code)?.data.sheet_row_ref // still linked
  )
  if (missing.length > 0) {
    const managers = await projectManagerUids(db, projectId)
    for (const code of missing) {
      const item = itemByCode.get(code)!
      batch.update(db.collection(COLLECTIONS.contentItems).doc(item.id), {
        sheet_row_ref: null,
        sheet_unlinked_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        updated_by: SYNC_ACTOR,
      })
      for (const uid of managers) {
        queueNotification(db, batch, {
          recipient_id: uid,
          type: "sync_issue",
          content_item_id: item.id,
          project_id: projectId,
          message: `Hạng mục ${code} đã bị xoá khỏi Google Sheet — hệ thống giữ lại và đánh dấu "mất liên kết"`,
        })
      }
      result.unlinked++
      ops++
    }
  }

  if (ops > 0) await batch.commit()
  return { result, snapshot: current }
}

// A fresh snapshot of the sheet's mapped cells — used to persist post-sync state.
export async function captureSnapshot(
  accessToken: string,
  cfg: MappedSheetConfig
): Promise<SheetSnapshot> {
  const ctx = await readMappedSheet(accessToken, cfg)
  return ctx.codeCol < 0 ? {} : snapshotOf(ctx, cfg)
}
