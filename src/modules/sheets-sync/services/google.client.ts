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
