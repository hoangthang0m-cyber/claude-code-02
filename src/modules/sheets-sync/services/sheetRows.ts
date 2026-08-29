import { Timestamp } from "firebase-admin/firestore"

import {
  CONTENT_FORMATS,
  CONTENT_STATUSES,
  SHEET_INBOUND_FIELDS,
} from "@/lib/domain"
import { readSheetValues } from "@/lib/server/google/sheets"

// Shared sheet-row plumbing for the sheet → system directions (first pull, task
// 6.2; delta pull, task 6.4). One place decides how a sheet cell maps to a
// ContentItem field and which values are rejected (SPEC §5.5 R1).

export interface MappedSheetConfig {
  spreadsheet_id: string
  sheet_tab: string
  header_row: number
  column_map: Record<string, string>
}

export interface SheetRowContext {
  headers: string[]
  /** 0-based index of the column mapped to `code`; -1 if not present */
  codeCol: number
  /** data rows (header excluded) */
  dataRows: string[][]
}

export async function readMappedSheet(
  accessToken: string,
  cfg: MappedSheetConfig
): Promise<SheetRowContext> {
  const rows = await readSheetValues(
    accessToken,
    cfg.spreadsheet_id,
    `'${cfg.sheet_tab}'!A${cfg.header_row}:ZZ`
  )
  const headers = (rows[0] ?? []).map((c) => c.trim())
  const codeHeader = cfg.column_map.code
  return {
    headers,
    codeCol: codeHeader ? headers.indexOf(codeHeader) : -1,
    dataRows: rows.slice(1),
  }
}

export function cellOf(
  ctx: SheetRowContext,
  cfg: MappedSheetConfig,
  row: string[],
  field: string
): string {
  const header = cfg.column_map[field]
  if (!header) return ""
  const i = ctx.headers.indexOf(header)
  return i >= 0 ? (row[i] ?? "").trim() : ""
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
    for (const field of Object.keys(cfg.column_map)) {
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
