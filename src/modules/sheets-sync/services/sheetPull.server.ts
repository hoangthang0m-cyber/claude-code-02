import { FieldValue } from "firebase-admin/firestore"

import { CONTENT_STATUSES, COLLECTIONS } from "@/lib/domain"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { memberNameMap } from "@/modules/sheets-sync/services/sheetMapping.server"
import {
  readMappedSheet,
  resolveField,
  snapshotOf,
  type MappedSheetConfig,
  type SheetSnapshot,
} from "@/modules/sheets-sync/services/sheetRows"

// SPEC §5.5 R2 / §6.3, task 6.4: the sheet → system direction, delta-driven.
// Reads the whole sheet, diffs it against the snapshot from the previous sync,
// and applies only the changed cells. New rows become new ContentItems.
// Invalid enum values are skipped per-field with a warning (SPEC §5.5 R1).
// Row deletions are task 6.7; same-field conflicts are task 6.6.

const SYNC_ACTOR = "sheet-sync"

export interface SheetPullResult {
  rows_read: number
  created: number
  updated: number
  mapping_errors: number
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
    messages: [],
  }

  const ctx = await readMappedSheet(accessToken, cfg)
  if (ctx.codeCol < 0) return { result, snapshot: {} }

  const current = snapshotOf(ctx, cfg)
  result.rows_read = Object.keys(current).length

  const [existing, nameToUid] = await Promise.all([
    db.collection(COLLECTIONS.contentItems).where("project_id", "==", projectId).get(),
    memberNameMap(db, projectId),
  ])
  const idByCode = new Map<string, string>()
  for (const d of existing.docs) {
    const c = String(d.data().code ?? "").trim()
    if (c) idByCode.set(c, d.id)
  }

  const batch = db.batch()
  let ops = 0

  const applyFields = (
    code: string,
    fields: Record<string, string>,
    onlyChangedFrom: Record<string, string> | null
  ): Record<string, unknown> | null => {
    const patch: Record<string, unknown> = {}
    let touched = false
    for (const [field, cell] of Object.entries(fields)) {
      if (onlyChangedFrom && (onlyChangedFrom[field] ?? "") === cell) continue
      if (!onlyChangedFrom && !cell) continue // create: skip empty cells
      const r = resolveField(field, cell, nameToUid)
      if (r.ok) {
        Object.assign(patch, r.patch)
        touched = true
      } else {
        result.mapping_errors++
        result.messages.push(`${code}: ${r.message}, bỏ qua`)
      }
    }
    return touched ? patch : null
  }

  for (const [code, fields] of Object.entries(current)) {
    const prev = prevSnapshot[code]
    const existingId = idByCode.get(code)

    if (!existingId) {
      // a row we've never turned into a content item → create it (SPEC §5.5 R2)
      const patch = applyFields(code, fields, null) ?? {}
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

    // existing item — apply the cells that changed in the sheet since last sync
    const patch = applyFields(code, fields, prev ?? {})
    if (patch) {
      batch.update(db.collection(COLLECTIONS.contentItems).doc(existingId), {
        ...patch,
        sheet_row_ref: code,
        updated_at: FieldValue.serverTimestamp(),
        updated_by: SYNC_ACTOR,
      })
      result.updated++
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
