import { Timestamp } from "firebase-admin/firestore"

import {
  CONTENT_FORMATS,
  CONTENT_STATUSES,
  SHEET_INBOUND_FIELDS,
} from "@/lib/domain"
import { readSheetValues } from "@/lib/server/google/sheets"
import {
  recognizeColumns,
  type SheetColumnField,
} from "@/modules/sheets-sync/services/sheetSchema"

// Shared sheet-row plumbing for the sheet → system direction. Columns are
// recognised by the fixed-schema alias dictionary (sheets-sync-fixed-schema §2),
// NOT a manual column map; `column_map` is kept on the config only until the
// migration drops it.

export interface MappedSheetConfig {
  spreadsheet_id: string
  sheet_tab: string
  header_row: number
  /** deprecated — ignored on read; kept until the migration removes it */
  column_map?: Record<string, string>
  /** SPEC §5.5 R3 — who wins when the same field changed on both sides. */
  conflict_rule?: "system_wins" | "sheet_wins"
}

export interface SheetRowContext {
  headers: string[]
  /** field → 0-based column index, from the fixed-schema recogniser */
  columns: Partial<Record<SheetColumnField, number>>
  /** standard fields whose column was found */
  recognized: SheetColumnField[]
  /** standard fields whose column was NOT found */
  missing: SheetColumnField[]
  /** recogniser warnings (e.g. two columns matched one field) */
  warnings: string[]
  /** 0-based index of the `code` column; -1 if not present */
  codeCol: number
  /** data rows: after the header, fully-empty rows dropped */
  dataRows: string[][]
}

// task 3.1 / 3.2 — read the WHOLE tab, take the header at `values[header_row-1]`,
// data at `values[header_row..]`, and drop rows that are entirely empty (blank
// rows and a merged page-title row above the header are ignored).
export async function readMappedSheet(
  accessToken: string,
  cfg: MappedSheetConfig
): Promise<SheetRowContext> {
  const rows = await readSheetValues(
    accessToken,
    cfg.spreadsheet_id,
    `'${cfg.sheet_tab}'`
  )
  const headerIdx = Math.max(0, (cfg.header_row || 1) - 1)
  const headers = (rows[headerIdx] ?? []).map((c) => c.trim())
  const rec = recognizeColumns(headers)

  const dataRows = rows
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => (c ?? "").trim() !== ""))

  return {
    headers,
    columns: rec.columns,
    recognized: rec.recognized,
    missing: rec.missing,
    warnings: rec.warnings,
    codeCol: rec.columns.code ?? -1,
    dataRows,
  }
}

export function cellOf(
  ctx: SheetRowContext,
  _cfg: MappedSheetConfig,
  row: string[],
  field: string
): string {
  const i = ctx.columns[field as SheetColumnField]
  return i != null ? (row[i] ?? "").trim() : ""
}

// Snapshot = the mapped cell values keyed by code, for delta detection
// (SPEC §6.3 "so với snapshot lần đồng bộ trước").
export type SheetSnapshot = Record<string, Record<string, string>>

export function snapshotOf(
  ctx: SheetRowContext,
  cfg: MappedSheetConfig
): SheetSnapshot {
  const snap: SheetSnapshot = {}
  for (const row of ctx.dataRows) {
    const code = ctx.codeCol >= 0 ? (row[ctx.codeCol] ?? "").trim() : ""
    if (!code) continue
    const fields: Record<string, string> = {}
    for (const field of ctx.recognized) {
      // only inbound fields — ads columns are push-only, never read back
      if (field === "code" || !isMappableField(field)) continue
      fields[field] = cellOf(ctx, cfg, row, field)
    }
    snap[code] = fields
  }
  return snap
}

export type FieldResolution =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; message: string }

// Convert one sheet cell into a ContentItem patch fragment, or an error.
export function resolveField(
  field: string,
  value: string,
  nameToUid: Map<string, string>
): FieldResolution {
  const v = value.trim()

  if (field === "status") {
    return (CONTENT_STATUSES as readonly string[]).includes(v)
      ? { ok: true, patch: { status: v } }
      : { ok: false, message: `trạng thái "${v}" không hợp lệ` }
  }
  if (field === "content_format") {
    if (!v) return { ok: true, patch: { content_format: null } }
    return (CONTENT_FORMATS as readonly string[]).includes(v)
      ? { ok: true, patch: { content_format: v } }
      : { ok: false, message: `định dạng "${v}" không hợp lệ` }
  }
  if (field === "deadline") {
    if (!v) return { ok: true, patch: { deadline: null } }
    const d = parseSheetDate(v)
    return d
      ? { ok: true, patch: { deadline: Timestamp.fromDate(d) } }
      : { ok: false, message: `deadline "${v}" không đọc được` }
  }
  if (field === "assignee") {
    if (!v) return { ok: true, patch: { assignee_id: null } }
    const uid = nameToUid.get(v.toLowerCase())
    return uid
      ? { ok: true, patch: { assignee_id: uid } }
      : { ok: false, message: `không tìm thấy nhân sự "${v}"` }
  }
  // plain text fields — empty clears
  return { ok: true, patch: { [field]: v || null } }
}

export function isMappableField(field: string): boolean {
  return (SHEET_INBOUND_FIELDS as readonly string[]).includes(field)
}

// The current system value of an inbound field, formatted the same way it is
// written down to the sheet (task 6.3's `valueFor`). Used for conflict
// detection (task 6.6): compare this against the last-sync snapshot.
export function systemFieldValue(
  field: string,
  item: Record<string, unknown>,
  nameByUid: Map<string, string>
): string {
  if (field === "deadline") {
    const d = (item.deadline as { toDate?: () => Date } | undefined)?.toDate?.()
    if (!d) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
  }
  if (field === "assignee") {
    const uid = String(item.assignee_id ?? "")
    return uid ? (nameByUid.get(uid) ?? "") : ""
  }
  const v = item[field]
  return v == null ? "" : String(v)
}

// Accepts DD/MM/YYYY, YYYY-MM-DD and full ISO strings; date-only → UTC midnight.
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
    return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])))
  }
  const iso = new Date(v)
  return Number.isNaN(iso.getTime()) ? null : iso
}
