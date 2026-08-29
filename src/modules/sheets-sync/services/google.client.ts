import { authedJson } from "@/lib/api/authedFetch"
import type { GoogleConnectionView } from "@/lib/domain"

// Client wrappers for the Google connect APIs (SPEC §6.3, task 6.1).

export function getGoogleConnection() {
  return authedJson<{ connection: GoogleConnectionView | null }>(
    "/api/google/connection"
  )
}

export function startGoogleConnect() {
  return authedJson<{ url: string }>("/api/google/connect/start", {
    method: "POST",
  })
}

export interface SheetVerifyResult {
  can_read: boolean
  can_write: boolean
  spreadsheet_id: string
  spreadsheet_title: string
  sheet_tab: string
  sheet_gid: number
}

export function verifyProjectSheet(projectId: string, url: string) {
  return authedJson<SheetVerifyResult>(
    `/api/projects/${projectId}/sheet/verify`,
    { method: "POST", body: JSON.stringify({ url }) }
  )
}

// task 6.2 — SheetSyncMapping config
export interface SheetPreview {
  can_read: boolean
  can_write: boolean
  spreadsheet_title: string
  sheet_tab: string
  header_columns: string[]
}

export interface SheetMapping {
  spreadsheet_id: string
  sheet_tab: string
  header_row: number
  column_map: Record<string, string>
  conflict_rule: string
  progress_sheet_url: string | null
}

export interface FirstSyncResult {
  rows_read: number
  content_items: number
  created: number
  updated: number
  mapping_errors: number
  messages: string[]
}

export function getSheetMapping(projectId: string) {
  return authedJson<{ mapping: SheetMapping | null }>(
    `/api/projects/${projectId}/sheet/mapping`
  )
}

export function previewSheet(projectId: string, url: string, headerRow: number) {
  return authedJson<SheetPreview>(
    `/api/projects/${projectId}/sheet/preview`,
    { method: "POST", body: JSON.stringify({ url, header_row: headerRow }) }
  )
}

export function saveSheetMapping(
  projectId: string,
  body: {
    url: string
    header_row: number
    column_map: Record<string, string>
    conflict_rule: string
  }
) {
  return authedJson<{ id: string; sheet_tab: string; first_sync: FirstSyncResult }>(
    `/api/projects/${projectId}/sheet/mapping`,
    { method: "PUT", body: JSON.stringify(body) }
  )
}

export interface SheetSyncResult {
  pull: {
    rows_read: number
    created: number
    updated: number
    mapping_errors: number
    messages: string[]
  }
  push: { rows_matched: number; cells_written: number }
}

export function syncSheetNow(projectId: string) {
  return authedJson<SheetSyncResult>(`/api/projects/${projectId}/sheet/sync`, {
    method: "POST",
  })
}

// task 6.8 — sync status + log screen (SPEC §5.5 R3 / R4)
export interface SyncRunView {
  id: string
  kind: "sheets" | "ads"
  started_at: number | null
  finished_at: number | null
  result: "ok" | "warning" | "error" | null
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
  last_run: SyncRunView | null
  runs: SyncRunView[]
  conflicts: SyncConflictView[]
}

export function getSheetSyncLog(projectId: string) {
  return authedJson<SheetSyncLog>(`/api/projects/${projectId}/sheet/sync`)
}
