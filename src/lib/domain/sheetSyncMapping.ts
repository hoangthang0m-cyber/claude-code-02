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

// System fields a sheet column can feed into a ContentItem (SPEC §6.2, the
// "Sheet ghi ✓" rows). `code` is the row key and is required in a mapping.
// Ads-metric fields are push-down only (task 6.5) and never appear here.
export const SHEET_INBOUND_FIELDS = [
  "code",
  "deadline",
  "assignee",
  "topic",
  "content_format",
  "script_url",
  "video_url",
  "customer_research_url",
  "status",
  "evaluation",
  // sheets-sync-fixed-schema §2.4 — free-text "Báo cáo hiệu quả ads" note,
  // separate from the Meta AdsMetric numbers.
  "ads_report_note",
] as const
export type SheetInboundField = (typeof SHEET_INBOUND_FIELDS)[number]

export const SHEET_INBOUND_FIELD_LABELS: Record<SheetInboundField, string> = {
  code: "Mã hạng mục",
  deadline: "Deadline",
  assignee: "Nhân sự thực hiện",
  topic: "Chủ đề",
  content_format: "Định dạng",
  script_url: "Link kịch bản",
  video_url: "Link video",
  customer_research_url: "Link research KH",
  status: "Trạng thái sản xuất",
  evaluation: "Đánh giá / đề xuất",
  ads_report_note: "Báo cáo hiệu quả ads (ghi chú)",
}

// Ads-metric columns are PUSH-ONLY (SPEC §6.2): the sync writes them down to the
// sheet but never reads them back, so a hand-edit on the sheet cannot overwrite
// a synced number with a stale one.
export const SHEET_ADS_FIELDS = [
  "spend",
  "messages",
  "cost_per_purchase",
  "roas",
  "ctr",
  "delivery_status",
  "ads_started_on",
  "data_as_of",
] as const
export type SheetAdsField = (typeof SHEET_ADS_FIELDS)[number]

export const SHEET_ADS_FIELD_LABELS: Record<SheetAdsField, string> = {
  spend: "Ads – Chi phí",
  messages: "Ads – Tin nhắn",
  cost_per_purchase: "Ads – CPP",
  roas: "Ads – ROAS",
  ctr: "Ads – CTR",
  delivery_status: "Ads – Trạng thái phân phối",
  ads_started_on: "Ads – Ngày bắt đầu",
  data_as_of: "Ads – Số liệu tính đến",
}

export function isAdsSheetField(field: string): boolean {
  return (SHEET_ADS_FIELDS as readonly string[]).includes(field)
}

// Save request from the config screen (SPEC §5.5 R1). `spreadsheet_id` /
// `sheet_tab` are resolved from `url` + the verify step, not sent in the body.
export const sheetMappingSaveSchema = z.object({
  url: z.string().trim().min(1),
  header_row: z.number().int().positive().default(1),
  column_map: z.record(z.string().trim().min(1), z.string().trim().min(1)),
  conflict_rule: z.enum(SYNC_CONFLICT_RULES).default("system_wins"),
})

export type SheetMappingSave = z.infer<typeof sheetMappingSaveSchema>
