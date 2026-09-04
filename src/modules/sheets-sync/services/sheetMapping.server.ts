import { FieldValue, Timestamp } from "firebase-admin/firestore"

import {
  CONTENT_FORMATS,
  CONTENT_STATUSES,
  COLLECTIONS,
  isAdsSheetField,
  parseSheetUrl,
  sheetMappingSaveSchema,
  type ContentFormat,
  type ContentStatus,
} from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import {
  readSheetValues,
  verifySheetAccess,
} from "@/lib/server/google/sheets"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"
import { getGoogleAccessToken } from "@/modules/sheets-sync/services/googleConnection.server"
import {
  cellOf,
  readMappedSheet,
  snapshotOf,
} from "@/modules/sheets-sync/services/sheetRows"

// SPEC §5.5 R1, task 6.2: the SheetSyncMapping config — one per project, with
// the header row, the column→field map and the conflict rule — plus the first
// sheet→system pull when it is saved.

const SYNC_ACTOR = "sheet-sync"

// task 6.9: a project's sheet sync can be paused. `manual` = a manager turned it
// off (SPEC §5.5 R4); `permission_lost` = a sync run lost read/write access and
// the job paused itself + notified the managers (R4 first bullet).
export type SyncDisabledReason = "manual" | "permission_lost"

export interface SheetMappingView {
  spreadsheet_id: string
  sheet_tab: string
  header_row: number
  column_map: Record<string, string>
  conflict_rule: string
  progress_sheet_url: string | null
  sync_enabled: boolean
  sync_disabled_reason: SyncDisabledReason | null
}

export async function getSheetMapping(
  actor: AuthedUser,
  projectId: string
): Promise<{ mapping: SheetMappingView | null }> {
  await requireProjectScope(actor.uid, projectId)
  const db = getAdminDb()
  const [snap, project] = await Promise.all([
    db.collection(COLLECTIONS.sheetSyncMappings).doc(projectId).get(),
    db.collection(COLLECTIONS.projects).doc(projectId).get(),
  ])
  if (!snap.exists) return { mapping: null }
  const d = snap.data() ?? {}
  return {
    mapping: {
      spreadsheet_id: String(d.spreadsheet_id ?? ""),
      sheet_tab: String(d.sheet_tab ?? ""),
      header_row: Number(d.header_row ?? 1),
      column_map: (d.column_map ?? {}) as Record<string, string>,
      conflict_rule: d.conflict_rule === "sheet_wins" ? "sheet_wins" : "system_wins",
      progress_sheet_url: (project.data()?.progress_sheet_url as string) ?? null,
      // absent → enabled (existing mappings predate the flag)
      sync_enabled: d.sync_enabled !== false,
      sync_disabled_reason:
        (d.sync_disabled_reason as SyncDisabledReason) ?? null,
    },
  }
}

// SPEC §5.5 R4: a manager turns background sync on/off for their project.
// Turning it off stops every background + manual sync but touches no data on
// either side (task 6.9); turning it back on clears the pause reason.
export async function setSheetSyncEnabled(
  actor: AuthedUser,
  projectId: string,
  enabled: boolean
): Promise<{ sync_enabled: boolean }> {
  const scope = await requireProjectScope(actor.uid, projectId)
  requireProjectManager(scope)

  const db = getAdminDb()
  const ref = db.collection(COLLECTIONS.sheetSyncMappings).doc(projectId)
  if (!(await ref.get()).exists) {
    throw new HttpError(409, "Dự án chưa cấu hình đồng bộ Google Sheets")
  }
  await ref.set(
    {
      sync_enabled: enabled,
      sync_disabled_reason: enabled ? FieldValue.delete() : "manual",
      sync_disabled_at: enabled ? FieldValue.delete() : FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
  return { sync_enabled: enabled }
}

// Verify + peek the header row so the config screen can offer real column names
// in its dropdowns (SPEC §5.5 R1: "chọn dòng tiêu đề, ánh xạ ...").
export async function previewSheet(
  actor: AuthedUser,
  projectId: string,
  url: string,
  headerRow: number
): Promise<{
  can_read: boolean
  can_write: boolean
  spreadsheet_title: string
  sheet_tab: string
  header_columns: string[]
}> {
  const scope = await requireProjectScope(actor.uid, projectId)
  requireProjectManager(scope)

  const parsed = parseSheetUrl(url)
  if (!parsed) throw new HttpError(400, "Link không phải Google Sheets hợp lệ")

  const token = await getGoogleAccessToken(actor.uid)
  const access = await verifySheetAccess(
    token,
    parsed.spreadsheet_id,
    parsed.sheet_gid
  )

  const row = Math.max(1, Math.floor(headerRow) || 1)
  const values = await readSheetValues(
    token,
    parsed.spreadsheet_id,
    `'${access.sheet_tab}'!A${row}:ZZ${row}`
  )
  return {
    can_read: access.can_read,
    can_write: access.can_write,
    spreadsheet_title: access.spreadsheet_title,
    sheet_tab: access.sheet_tab,
    header_columns: (values[0] ?? []).map((c) => c.trim()).filter(Boolean),
  }
}

export interface FirstSyncResult {
  rows_read: number
  content_items: number
  created: number
  updated: number
  mapping_errors: number
  messages: string[]
}

export async function saveSheetMapping(
  actor: AuthedUser,
  projectId: string,
  body: unknown
): Promise<{ id: string; sheet_tab: string; first_sync: FirstSyncResult }> {
  const scope = await requireProjectScope(actor.uid, projectId)
  requireProjectManager(scope)
  await assertProjectWritable(projectId)

  const input = parseOrThrow(sheetMappingSaveSchema, body)
  if (!input.column_map.code) {
    throw new HttpError(400, 'Bắt buộc ánh xạ cột "Mã hạng mục" (code)')
  }

  const parsed = parseSheetUrl(input.url)
  if (!parsed) throw new HttpError(400, "Link không phải Google Sheets hợp lệ")

  const token = await getGoogleAccessToken(actor.uid)
  const access = await verifySheetAccess(
    token,
    parsed.spreadsheet_id,
    parsed.sheet_gid
  )
  if (!access.can_write) {
    throw new HttpError(403, "Bạn không có quyền ghi vào sheet này")
  }

  const db = getAdminDb()
  await db.collection(COLLECTIONS.sheetSyncMappings).doc(projectId).set({
    project_id: projectId,
    spreadsheet_id: access.spreadsheet_id,
    sheet_tab: access.sheet_tab,
    header_row: input.header_row,
    column_map: input.column_map,
    conflict_rule: input.conflict_rule,
    updated_at: FieldValue.serverTimestamp(),
  })
  await db.collection(COLLECTIONS.projects).doc(projectId).update({
    progress_sheet_url: input.url,
  })

  const first_sync = await runFirstSheetSync(
    projectId,
    {
      spreadsheet_id: access.spreadsheet_id,
      sheet_tab: access.sheet_tab,
      header_row: input.header_row,
      column_map: input.column_map,
    },
    token
  )

  return { id: projectId, sheet_tab: access.sheet_tab, first_sync }
}

interface MappingConfig {
  spreadsheet_id: string
  sheet_tab: string
  header_row: number
  column_map: Record<string, string>
}

// SPEC §5.5 R1: "lưu cấu hình + thực hiện lần đồng bộ đầu tiên". A first pull
// has no prior snapshot, so every data row is matched/created by `code`.
// Invalid enum values (status / content_format) are skipped per-field with a
// warning, not a failure (SPEC §5.5 R1).
export async function runFirstSheetSync(
  projectId: string,
  cfg: MappingConfig,
  accessToken: string
): Promise<FirstSyncResult> {
  const db = getAdminDb()
  const startedAt = Timestamp.now()
  const result: FirstSyncResult = {
    rows_read: 0,
    content_items: 0,
    created: 0,
    updated: 0,
    mapping_errors: 0,
    messages: [],
  }

  // Columns are recognised by the fixed schema, the header row is taken at
  // `header_row - 1`, blank rows are dropped (sheets-sync-fixed-schema §2/§3).
  const ctx = await readMappedSheet(accessToken, cfg)
  const dataRows = ctx.dataRows
  result.rows_read = dataRows.length

  if (ctx.codeCol < 0) {
    result.messages.push("Không tìm thấy cột Mã bắt buộc — không tạo hạng mục nào")
    return result
  }

  const cell = (row: string[], field: string): string => cellOf(ctx, cfg, row, field)

  // existing items for this project, by code
  const existingSnap = await db
    .collection(COLLECTIONS.contentItems)
    .where("project_id", "==", projectId)
    .get()
  const byCode = new Map<string, string>() // code → doc id
  for (const d of existingSnap.docs) {
    const c = String(d.data().code ?? "")
    if (c) byCode.set(c, d.id)
  }

  // project member display names → uid (for the assignee column)
  const nameToUid = await memberNameMap(db, projectId)

  const batch = db.batch()
  for (const row of dataRows) {
    const code = cell(row, "code")
    if (!code) continue
    result.content_items++

    const patch: Record<string, unknown> = {
      updated_at: FieldValue.serverTimestamp(),
      updated_by: SYNC_ACTOR,
      sheet_row_ref: code,
    }

    for (const field of ctx.recognized) {
      if (field === "code" || isAdsSheetField(field)) continue
      const value = cell(row, field)
      if (!value) continue

      if (field === "status") {
        if ((CONTENT_STATUSES as readonly string[]).includes(value)) {
          patch.status = value as ContentStatus
        } else {
          result.mapping_errors++
          result.messages.push(`${code}: trạng thái "${value}" không hợp lệ, bỏ qua`)
        }
      } else if (field === "content_format") {
        if ((CONTENT_FORMATS as readonly string[]).includes(value)) {
          patch.content_format = value as ContentFormat
        } else {
          result.mapping_errors++
          result.messages.push(`${code}: định dạng "${value}" không hợp lệ, bỏ qua`)
        }
      } else if (field === "deadline") {
        const d = parseSheetDate(value)
        if (d) patch.deadline = Timestamp.fromDate(d)
        else {
          result.mapping_errors++
          result.messages.push(`${code}: deadline "${value}" không đọc được, bỏ qua`)
        }
      } else if (field === "assignee") {
        const uid = nameToUid.get(value.toLowerCase())
        if (uid) patch.assignee_id = uid
        else {
          result.mapping_errors++
          result.messages.push(`${code}: không tìm thấy nhân sự "${value}", bỏ qua`)
        }
      } else {
        patch[field] = value
      }
    }

    const existingId = byCode.get(code)
    if (existingId) {
      batch.update(db.collection(COLLECTIONS.contentItems).doc(existingId), patch)
      result.updated++
    } else {
      const ref = db.collection(COLLECTIONS.contentItems).doc()
      batch.set(ref, {
        project_id: projectId,
        code,
        status: patch.status ?? CONTENT_STATUSES[0],
        created_at: FieldValue.serverTimestamp(),
        ...patch,
      })
      result.created++
    }
  }

  // one SyncRun record (SPEC §5.5 R4)
  batch.set(db.collection(COLLECTIONS.syncRuns).doc(), {
    project_id: projectId,
    kind: "sheets",
    started_at: startedAt,
    finished_at: FieldValue.serverTimestamp(),
    result: result.mapping_errors > 0 ? "warning" : "ok",
    rows_read: result.rows_read,
    rows_written: result.created + result.updated,
    message:
      result.mapping_errors > 0
        ? `${result.mapping_errors} dòng lỗi ánh xạ`
        : "Đồng bộ lần đầu xong",
  })

  // baseline snapshot so the delta sync has something to diff against
  batch.set(
    db.collection(COLLECTIONS.sheetSyncMappings).doc(projectId),
    { snapshot: snapshotOf(ctx, cfg) },
    { merge: true }
  )

  await batch.commit()
  return result
}

export async function memberNameMap(
  db: ReturnType<typeof getAdminDb>,
  projectId: string
): Promise<Map<string, string>> {
  const members = await db
    .collection(COLLECTIONS.projectMembers)
    .where("project_id", "==", projectId)
    .get()
  const uids = members.docs.map((d) => String(d.data().user_id ?? ""))
  const map = new Map<string, string>()
  await Promise.all(
    uids.map(async (uid) => {
      const u = await db.collection(COLLECTIONS.users).doc(uid).get()
      const name = String(u.data()?.name ?? "").trim().toLowerCase()
      if (name) map.set(name, uid)
      const email = String(u.data()?.email ?? "").trim().toLowerCase()
      if (email) map.set(email, uid)
    })
  )
  return map
}

// Accepts DD/MM/YYYY, YYYY-MM-DD and full ISO strings. Date-only values are
// pinned to UTC midnight (deadlines are dates, not instants — same as the
// content-field endpoint).
export function parseSheetDate(value: string): Date | null {
  const v = value.trim()
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v)
  if (dmy) {
    const d = new Date(
      Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    )
    return Number.isNaN(d.getTime()) ? null : d
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (ymd) {
    return new Date(
      Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    )
  }
  const iso = new Date(v)
  return Number.isNaN(iso.getTime()) ? null : iso
}
