import {
  COLLECTIONS,
  SHEET_ADS_FIELDS,
  type AdsMetricView,
} from "@/lib/domain"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import {
  batchUpdateValues,
  columnLetter,
  readSheetValues,
} from "@/lib/server/google/sheets"
import {
  pickCurrentMetric,
  toMetricView,
} from "@/modules/ads-performance/services/adsMetrics.server"
import { systemFieldValue } from "@/modules/sheets-sync/services/sheetRows"

// SPEC §5.5 R2 / §6.3, task 6.3: the system → sheet direction. For every content
// item whose `code` matches a sheet row, write the current system value into
// each mapped cell that differs — only mapped cells ("ghi theo ô, chỉ các ô có
// ánh xạ").
//
// Task 6.5: the ads-metric columns are also written down here, but ONE-WAY —
// nothing reads them back (SPEC §6.2), so a hand-edit on the sheet can't
// overwrite a synced number.

// Content fields — two-way. Every inbound field except the row key.
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

function fmtDateMs(ms: number | null): string {
  if (ms == null) return ""
  const d = new Date(ms)
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

  const rowOf = new Map<string, number>()
  const cellAt = new Map<string, string[]>()
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

  const mapsAds = SHEET_ADS_FIELDS.some((f) => cfg.column_map[f])
  const metricByItem = mapsAds
    ? await currentMetrics(db, itemsSnap.docs.map((d) => d.id))
    : new Map<string, AdsMetricView | null>()

  const updates: Array<{ range: string; value: string }> = []
  for (const doc of itemsSnap.docs) {
    const item = doc.data()
    const code = String(item.code ?? "").trim()
    const sheetRow = rowOf.get(code)
    if (!sheetRow) continue
    result.rows_matched++
    const currentCells = cellAt.get(code) ?? []
    const metric = metricByItem.get(doc.id) ?? null

    const push = (field: string, value: string) => {
      const header = cfg.column_map[field]
      if (!header) return
      const col = headers.indexOf(header)
      if (col < 0) return
      if ((currentCells[col] ?? "").trim() === value) return
      updates.push({
        range: `'${cfg.sheet_tab}'!${columnLetter(col)}${sheetRow}`,
        value,
      })
    }

    for (const field of SYSTEM_TO_SHEET_FIELDS) {
      push(field, valueFor(field, item, nameByUid))
    }
    if (metric) {
      for (const field of SHEET_ADS_FIELDS) {
        push(field, adsValueFor(field, metric))
      }
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

function adsValueFor(field: string, m: AdsMetricView): string {
  switch (field) {
    case "spend":
      return String(Math.round(m.spend))
    case "messages":
      return String(Math.round(m.messages))
    case "cost_per_purchase":
      return String(Math.round(m.cost_per_purchase))
    case "roas":
      return m.roas.toFixed(2)
    case "ctr":
      return m.ctr.toFixed(2)
    case "delivery_status":
      return m.delivery_status
    case "ads_started_on":
      return fmtDateMs(m.ads_started_on)
    case "data_as_of":
      return fmtDateMs(m.data_as_of)
    default:
      return ""
  }
}

async function currentMetrics(
  db: ReturnType<typeof getAdminDb>,
  itemIds: string[]
): Promise<Map<string, AdsMetricView | null>> {
  const rowsByItem = new Map<string, AdsMetricView[]>()
  for (let i = 0; i < itemIds.length; i += 30) {
    const snap = await db
      .collection(COLLECTIONS.adsMetrics)
      .where("content_item_id", "in", itemIds.slice(i, i + 30))
      .get()
    for (const d of snap.docs) {
      const key = String(d.data().content_item_id ?? "")
      const view = toMetricView(d.id, d.data())
      ;(rowsByItem.get(key) ?? rowsByItem.set(key, []).get(key)!).push(view)
    }
  }
  const out = new Map<string, AdsMetricView | null>()
  for (const id of itemIds) {
    out.set(id, pickCurrentMetric(rowsByItem.get(id) ?? []))
  }
  return out
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
