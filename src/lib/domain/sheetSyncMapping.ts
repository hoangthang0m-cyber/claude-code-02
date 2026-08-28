import { z } from "zod"

import {
  SYNC_CONFLICT_RULES,
  type SyncConflictRule,
} from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: SheetSyncMapping (id, project_id, spreadsheet_id, sheet_tab,
//   header_row, column_map: {field -> column},
//   conflict_rule: system_wins | sheet_wins)
//
// One mapping per project (SPEC §5.5 R1: a project ↔ exactly one Sheet tab).
// `column_map` maps a system field name to a sheet column (letter or header
// text). Ads-metric fields may appear here for the one-way push down to the
// sheet, but are never read back (SPEC §6.2).

export interface SheetSyncMapping {
  id: string
  project_id: string
  spreadsheet_id: string
  sheet_tab: string
  header_row: number
  column_map: Record<string, string>
  conflict_rule: SyncConflictRule
}

export const sheetSyncMappingWriteSchema = z.object({
  project_id: idString,
  spreadsheet_id: z.string().trim().min(1),
  sheet_tab: z.string().trim().min(1),
  header_row: z.number().int().positive(),
  column_map: z.record(z.string().trim().min(1), z.string().trim().min(1)),
  conflict_rule: z.enum(SYNC_CONFLICT_RULES).default("system_wins"),
})

export type SheetSyncMappingWrite = z.infer<typeof sheetSyncMappingWriteSchema>

// SPEC §5.1 R1 / §5.5 R1, task 6.1: pull the spreadsheet id (and the tab gid,
// when present) out of a Google Sheets URL. The tab *name* is resolved later
// from the Sheets API — the URL only carries the numeric gid.
export interface ParsedSheetUrl {
  spreadsheet_id: string
  sheet_gid: number | null
}

export function parseSheetUrl(url: string): ParsedSheetUrl | null {
  const trimmed = (url ?? "").trim()
  const idMatch = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(trimmed)
  if (!idMatch) return null

  const gidMatch = /[#?&]gid=([0-9]+)/.exec(trimmed)
  return {
    spreadsheet_id: idMatch[1],
    sheet_gid: gidMatch ? Number(gidMatch[1]) : null,
  }
}
