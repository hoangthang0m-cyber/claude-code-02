import { HttpError } from "@/lib/server/http"

// Just enough of the Sheets + Drive REST APIs to verify a manager can read and
// write a spreadsheet (SPEC §5.1 R1 / §5.5 R1, task 6.1). The full two-way sync
// lands in tasks 6.3–6.4.

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets"
const DRIVE_BASE = "https://www.googleapis.com/drive/v3/files"

type Fetch = typeof fetch

export interface SpreadsheetMeta {
  title: string
  tabs: Array<{ sheet_id: number; title: string }>
}

async function googleGet(
  fetchImpl: Fetch,
  url: string,
  accessToken: string,
  context: string
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
  } catch {
    throw new HttpError(502, `Không gọi được Google (${context})`)
  }
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!res.ok || !json || json.error) {
    const err = (json?.error ?? {}) as { message?: string; code?: number }
    const code = err.code ?? res.status
    if (code === 401) throw new HttpError(401, `Google từ chối token (${context})`)
    if (code === 403) throw new HttpError(403, `Không có quyền (${context})`)
    if (code === 404) throw new HttpError(404, `Không tìm thấy sheet (${context})`)
    throw new HttpError(502, `Google lỗi (${context}): ${err.message ?? code}`)
  }
  return json
}

export async function getSpreadsheetMeta(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl: Fetch = fetch
): Promise<SpreadsheetMeta> {
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties(sheetId,title)`
  const json = await googleGet(fetchImpl, url, accessToken, "đọc sheet")
  const props = (json.properties ?? {}) as { title?: string }
  const sheets = Array.isArray(json.sheets) ? json.sheets : []
  return {
    title: props.title ?? "",
    tabs: sheets.map((s) => {
      const p = (s as { properties?: Record<string, unknown> }).properties ?? {}
      return {
        sheet_id: Number(p.sheetId ?? 0),
        title: String(p.title ?? ""),
      }
    }),
  }
}

// Reads a rectangular block of a tab as rows of formatted strings (SPEC §5.5
// R2, task 6.2's first sync). Empty trailing cells are omitted by the API, so
// callers index by the header map, not by a fixed width.
export async function readSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  fetchImpl: Fetch = fetch
): Promise<string[][]> {
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`
  const json = await googleGet(fetchImpl, url, accessToken, "đọc dữ liệu sheet")
  const values = Array.isArray(json.values) ? json.values : []
  return values.map((row) =>
    Array.isArray(row) ? row.map((c) => String(c ?? "")) : []
  )
}

// SPEC §6.3: write cells one at a time ("ghi theo ô, chỉ các ô có ánh xạ").
export async function batchUpdateValues(
  accessToken: string,
  spreadsheetId: string,
  updates: Array<{ range: string; value: string }>,
  fetchImpl: Fetch = fetch
): Promise<number> {
  if (updates.length === 0) return 0
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates.map((u) => ({ range: u.range, values: [[u.value]] })),
      }),
    })
  } catch {
    throw new HttpError(502, "Không ghi được vào Google Sheet")
  }
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!res.ok || !json || json.error) {
    const err = (json?.error ?? {}) as { message?: string; code?: number }
    if (err.code === 403) throw new HttpError(403, "Không có quyền ghi sheet")
    throw new HttpError(502, `Google lỗi khi ghi: ${err.message ?? res.status}`)
  }
  return Number(json.totalUpdatedCells ?? updates.length)
}

// column index (0-based) → A1 letter
export function columnLetter(index: number): string {
  let n = index
  let out = ""
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

export async function getDriveCapabilities(
  accessToken: string,
  fileId: string,
  fetchImpl: Fetch = fetch
): Promise<{ can_edit: boolean }> {
  const url = `${DRIVE_BASE}/${encodeURIComponent(fileId)}?fields=capabilities/canEdit&supportsAllDrives=true`
  const json = await googleGet(fetchImpl, url, accessToken, "kiểm tra quyền")
  const caps = (json.capabilities ?? {}) as { canEdit?: boolean }
  return { can_edit: caps.canEdit === true }
}

export interface SheetAccessCheck {
  can_read: boolean
  can_write: boolean
  spreadsheet_id: string
  spreadsheet_title: string
  sheet_tab: string
  sheet_gid: number
}

// SPEC §5.1 R1: "URL không hợp lệ / không có quyền → cảnh báo link chưa dùng
// được". A read failure surfaces as an HttpError; a read-only file comes back
// with can_write=false so the caller can warn without saving a mapping.
export async function verifySheetAccess(
  accessToken: string,
  spreadsheetId: string,
  sheetGid: number | null,
  fetchImpl: Fetch = fetch
): Promise<SheetAccessCheck> {
  const meta = await getSpreadsheetMeta(accessToken, spreadsheetId, fetchImpl)
  const caps = await getDriveCapabilities(accessToken, spreadsheetId, fetchImpl)

  const tab =
    sheetGid != null
      ? meta.tabs.find((t) => t.sheet_id === sheetGid)
      : meta.tabs[0]
  if (!tab) {
    throw new HttpError(400, "Tab trong link không tồn tại trong sheet này")
  }

  return {
    can_read: true,
    can_write: caps.can_edit,
    spreadsheet_id: spreadsheetId,
    spreadsheet_title: meta.title,
    sheet_tab: tab.title,
    sheet_gid: tab.sheet_id,
  }
}
