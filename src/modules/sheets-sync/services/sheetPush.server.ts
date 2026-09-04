import { COLLECTIONS } from "@/lib/domain"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import {
  batchUpdateValues,
  columnLetter,
  readSheetValues,
} from "@/lib/server/google/sheets"
import {
  recognizeColumns,
  type SheetColumnField,
} from "@/modules/sheets-sync/services/sheetSchema"
import { systemFieldValue } from "@/modules/sheets-sync/services/sheetRows"

// SPEC §5.5 R2 / §6.3: the system → sheet direction. For every content item
// whose `code` matches a sheet row, write the current system value into each
// recognised column that differs. Columns are found by the fixed-schema
// recogniser (sheets-sync-fixed-schema §2), same as the read direction.
//
// The Meta AdsMetric numbers are no longer written to the sheet — the fixed
// schema has only the free-text "Báo cáo hiệu quả ads" column, which is
// sheet-owned (read-only from the system's side).

// Content fields — two-way. Every inbound field except the row key and the
// sheet-owned ads note.
const SYSTEM_TO_SHEET_FIELDS: SheetColumnField[] = [
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
  column_map?: Record<string, string>
}

export async function syncSystemToSheet(
  projectId: string,
  cfg: PushConfig,
  accessToken: string
): Promise<SheetPushResult> {
  const db = getAdminDb()
  const result: SheetPushResult = { rows_matched: 0, cells_written: 0 }

  const headerIdx = Math.max(0, (cfg.header_row || 1) - 1)
  const rows = await readSheetValues(
    accessToken,
    cfg.spreadsheet_id,
    `'${cfg.sheet_tab}'`
  )
  const headers = (rows[headerIdx] ?? []).map((c) => c.trim())
  const { columns } = recognizeColumns(headers)
  const codeCol = columns.code ?? -1
  if (codeCol < 0) return result

  const rowOf = new Map<string, number>()
  const cellAt = new Map<string, string[]>()
  rows.slice(headerIdx + 1).forEach((row, i) => {
    const code = (row[codeCol] ?? "").trim()
    if (code) {
      rowOf.set(code, headerIdx + 2 + i)
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

    const push = (field: SheetColumnField, value: string) => {
      const col = columns[field]
      if (col == null) return
      if ((currentCells[col] ?? "").trim() === value) return
      updates.push({
        range: `'${cfg.sheet_tab}'!${columnLetter(col)}${sheetRow}`,
        value,
      })
    }

    for (const field of SYSTEM_TO_SHEET_FIELDS) {
      push(field, valueFor(field, item, nameByUid))
    }
  }

  result.cells_written = await batchUpdateValues(
    accessToken,
    cfg.spreadsheet_id,
    updates
  )
  return result
}

const valueFor = systemFieldValue

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
