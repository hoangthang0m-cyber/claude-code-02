import { COLLECTIONS } from "@/lib/domain"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import {
  batchUpdateValues,
  columnLetter,
  readSheetValues,
} from "@/lib/server/google/sheets"

// SPEC §5.5 R2 / §6.3, task 6.3: the system → sheet direction. For every content
// item whose `code` matches a sheet row, write the current system value into
// each mapped cell that differs. Only mapped cells are touched ("ghi theo ô,
// chỉ các ô có ánh xạ"). Ads-metric fields (push-down) land in task 6.5.

// Fields written down to the sheet — every inbound field except the row key.
const SYSTEM_TO_SHEET_FIELDS = [
  "deadline",
  "assignee",
  "topic",
  "content_format",
  "script_url",
  "video_url",
  "customer_research_url",
  "status",
  "evaluation",
]

export interface SheetPushResult {
  rows_matched: number
  cells_written: number
}

interface PushConfig {
  spreadsheet_id: string
  sheet_tab: string
  header_row: number
  column_map: Record<string, string>
}

function fmtDate(ts: { toDate?: () => Date } | undefined): string {
  const d = ts?.toDate?.()
  if (!d) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

export async function syncSystemToSheet(
  projectId: string,
  cfg: PushConfig,
  accessToken: string
): Promise<SheetPushResult> {
  const db = getAdminDb()
  const result: SheetPushResult = { rows_matched: 0, cells_written: 0 }

  const rows = await readSheetValues(
    accessToken,
    cfg.spreadsheet_id,
    `'${cfg.sheet_tab}'!A${cfg.header_row}:ZZ`
  )
  const headers = (rows[0] ?? []).map((c) => c.trim())
  const codeHeader = cfg.column_map.code
  const codeCol = codeHeader ? headers.indexOf(codeHeader) : -1
  if (codeCol < 0) return result

  // code → 1-based sheet row number (header is at cfg.header_row)
  const rowOf = new Map<string, number>()
  const cellAt = new Map<string, string[]>() // code → the row's cells
  rows.slice(1).forEach((row, i) => {
    const code = (row[codeCol] ?? "").trim()
    if (code) {
      rowOf.set(code, cfg.header_row + 1 + i)
      cellAt.set(code, row)
    }
  })

  const [itemsSnap, nameByUid] = await Promise.all([
    db.collection(COLLECTIONS.contentItems).where("project_id", "==", projectId).get(),
    memberNames(db, projectId),
  ])

  const updates: Array<{ range: string; value: string }> = []
  for (const doc of itemsSnap.docs) {
    const item = doc.data()
    const code = String(item.code ?? "").trim()
    const sheetRow = rowOf.get(code)
    if (!sheetRow) continue
    result.rows_matched++
    const currentCells = cellAt.get(code) ?? []

    for (const field of SYSTEM_TO_SHEET_FIELDS) {
      const header = cfg.column_map[field]
      if (!header) continue
      const col = headers.indexOf(header)
      if (col < 0) continue

      const systemValue = valueFor(field, item, nameByUid)
      const sheetValue = (currentCells[col] ?? "").trim()
      if (systemValue === sheetValue) continue

      updates.push({
        range: `'${cfg.sheet_tab}'!${columnLetter(col)}${sheetRow}`,
        value: systemValue,
      })
    }
  }

  result.cells_written = await batchUpdateValues(
    accessToken,
    cfg.spreadsheet_id,
    updates
  )
  return result
}

function valueFor(
  field: string,
  item: Record<string, unknown>,
  nameByUid: Map<string, string>
): string {
  if (field === "deadline") {
    return fmtDate(item.deadline as { toDate?: () => Date } | undefined)
  }
  if (field === "assignee") {
    const uid = String(item.assignee_id ?? "")
    return uid ? (nameByUid.get(uid) ?? "") : ""
  }
  const v = item[field]
  return v == null ? "" : String(v)
}

async function memberNames(
  db: ReturnType<typeof getAdminDb>,
  projectId: string
): Promise<Map<string, string>> {
  const members = await db
    .collection(COLLECTIONS.projectMembers)
    .where("project_id", "==", projectId)
    .get()
  const map = new Map<string, string>()
  await Promise.all(
    members.docs.map(async (m) => {
      const uid = String(m.data().user_id ?? "")
      const u = await db.collection(COLLECTIONS.users).doc(uid).get()
      const name = String(u.data()?.name ?? "").trim()
      if (uid && name) map.set(uid, name)
    })
  )
  return map
}
