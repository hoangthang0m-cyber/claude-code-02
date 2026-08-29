import { beforeEach, describe, expect, it, vi } from "vitest"

// SPEC §5.5 / §6.3, task 9.3: an integration walk of the whole Google Sheets
// sync — first load, two-way edit, add row, conflict, delete row, lost access —
// as one connected sequence on a single project, over an in-memory sheet + an
// in-memory Firestore so state persists across syncs. Each piece has its own
// unit tests; this proves they compose.

const { fx } = vi.hoisted(() => ({
  fx: {
    sheet: [] as string[][],
    items: new Map<string, Record<string, unknown>>(),
    mappingDoc: {} as Record<string, unknown>,
    conflicts: [] as Record<string, unknown>[],
    notifications: [] as Record<string, unknown>[],
    runs: [] as Record<string, unknown>[],
    managers: ["u-mgr"] as string[],
    googleThrows: null as { status: number; message: string } | null,
    nextId: 1,
  },
}))

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

vi.mock("@/lib/server/google/sheets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/google/sheets")>()
  const { HttpError } = await import("@/lib/server/http")
  return {
    ...actual, // keep pure helpers: columnLetter, etc.
    readSheetValues: vi.fn(async () => {
      if (fx.googleThrows) throw new HttpError(fx.googleThrows.status, fx.googleThrows.message)
      return clone(fx.sheet)
    }),
    batchUpdateValues: vi.fn(
      async (_t: string, _id: string, updates: Array<{ range: string; value: string }>) => {
        if (fx.googleThrows) throw new HttpError(fx.googleThrows.status, fx.googleThrows.message)
        for (const u of updates) {
          const m = /!([A-Z]+)(\d+)$/.exec(u.range)
          if (!m) continue
          const col = m[1].split("").reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
          const row = Number(m[2]) - 1
          while (fx.sheet.length <= row) fx.sheet.push([])
          while (fx.sheet[row].length <= col) fx.sheet[row].push("")
          fx.sheet[row][col] = u.value
        }
        return updates.length
      }
    ),
    verifySheetAccess: vi.fn(async () => ({
      can_read: true,
      can_write: true,
      spreadsheet_id: "sheet-1",
      spreadsheet_title: "Tiến độ",
      sheet_tab: "nội dung",
      sheet_gid: 0,
    })),
  }
})

vi.mock("@/lib/server/firebaseAdmin", () => {
  const contentDocs = () =>
    [...fx.items.entries()].map(([id, data]) => ({ id, data: () => data }))

  const docHandle = (name: string, id?: string) => {
    const realId = id ?? `${name}-${fx.nextId++}`
    return {
      id: realId,
      get: async () => {
        if (name === "sheetSyncMappings") {
          return { exists: Object.keys(fx.mappingDoc).length > 0, data: () => fx.mappingDoc }
        }
        if (name === "contentItems") {
          const d = fx.items.get(realId)
          return { exists: d != null, data: () => d }
        }
        if (name === "users") return { data: () => ({}) }
        return { exists: false, data: () => undefined }
      },
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        if (name === "contentItems") fx.items.set(realId, { ...(opts?.merge ? fx.items.get(realId) : {}), ...data })
        else if (name === "sheetSyncMappings") Object.assign(fx.mappingDoc, data)
        else if (name === "syncConflicts") fx.conflicts.push(data)
        else if (name === "syncRuns") fx.runs.push(data)
        else if (name === "notifications") fx.notifications.push(data)
        else if (name === "projects") void 0
      },
      update: async (patch: Record<string, unknown>) => {
        if (name === "contentItems") fx.items.set(realId, { ...fx.items.get(realId), ...patch })
        else if (name === "projects") void 0
      },
      delete: async () => fx.items.delete(realId),
    }
  }

  const query = (name: string, clauses: string[]) => ({
    where: (f: string) => query(name, [...clauses, f]),
    get: async () => {
      if (name === "contentItems") return { docs: contentDocs() }
      if (name === "projectMembers" && clauses.includes("project_role")) {
        return { docs: fx.managers.map((u) => ({ data: () => ({ user_id: u }) })) }
      }
      if (name === "projectMembers") return { docs: [] }
      return { docs: [] }
    },
  })

  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => docHandle(name, id),
      }),
      batch: () => {
        const ops: Array<() => Promise<unknown>> = []
        return {
          set: (ref: { set: (d: unknown, o?: unknown) => Promise<unknown> }, d: unknown, o?: unknown) =>
            ops.push(() => ref.set(d, o)),
          update: (ref: { update: (d: unknown) => Promise<unknown> }, d: unknown) =>
            ops.push(() => ref.update(d)),
          commit: async () => {
            for (const op of ops) await op()
          },
        }
      },
    }),
  }
})

import { runFirstSheetSync } from "@/modules/sheets-sync/services/sheetMapping.server"
import {
  captureSnapshot,
  runDeltaSheetSync,
} from "@/modules/sheets-sync/services/sheetPull.server"
import { syncSystemToSheet } from "@/modules/sheets-sync/services/sheetPush.server"

const CFG = {
  spreadsheet_id: "sheet-1",
  sheet_tab: "nội dung",
  header_row: 1,
  column_map: { code: "Mã", status: "Trạng thái", topic: "Chủ đề" },
  conflict_rule: "system_wins" as const,
}
const P = "proj-1"

const itemByCode = (code: string) =>
  [...fx.items.values()].find((i) => i.code === code)
const snapshot = () => (fx.mappingDoc.snapshot ?? {}) as Record<string, Record<string, string>>
const sheetRow = (code: string) => fx.sheet.find((r) => r[0] === code)

async function delta() {
  const { result } = await runDeltaSheetSync(P, CFG, "tok", snapshot())
  await syncSystemToSheet(P, CFG, "tok")
  fx.mappingDoc.snapshot = await captureSnapshot("tok", CFG)
  return result
}

beforeEach(() => {
  fx.sheet = []
  fx.items.clear()
  fx.mappingDoc = { spreadsheet_id: "sheet-1", sheet_tab: "nội dung", header_row: 1, column_map: CFG.column_map, conflict_rule: "system_wins" }
  fx.conflicts = []
  fx.notifications = []
  fx.runs = []
  fx.managers = ["u-mgr"]
  fx.googleThrows = null
  fx.nextId = 1
})

describe("Google Sheets two-way sync — integration (SPEC §5.5, task 9.3)", () => {
  it("first load, two-way edit, add row, conflict, delete row, lost access", async () => {
    // ── 1. first load ─────────────────────────────────────────────────────
    fx.sheet = [
      ["Mã", "Trạng thái", "Chủ đề"],
      ["V001", "viet_kich_ban", "NYC"],
      ["V002", "quay_dung", "Photo"],
    ]
    const first = await runFirstSheetSync(P, CFG, "tok")
    expect(first.created).toBe(2)
    expect(itemByCode("V001")).toMatchObject({ status: "viet_kich_ban", topic: "NYC" })
    expect(snapshot().V001).toEqual({ status: "viet_kich_ban", topic: "NYC" })

    // ── 2. two-way edit ──────────────────────────────────────────────────
    // sheet side: V001 topic NYC → NYC 2 ; system side: V002 topic Photo → Video
    fx.sheet[1][2] = "NYC 2"
    fx.items.set(
      [...fx.items.entries()].find(([, d]) => d.code === "V002")![0],
      { ...itemByCode("V002"), topic: "Video" }
    )
    const r2 = await delta()
    expect(r2).toMatchObject({ created: 0, updated: 1, conflicts: 0 })
    expect(itemByCode("V001")?.topic).toBe("NYC 2") // sheet → system
    expect(sheetRow("V002")?.[2]).toBe("Video") // system → sheet

    // ── 3. add a row ────────────────────────────────────────────────────
    fx.sheet.push(["V003", "chua_bat_dau", "Reels"])
    const r3 = await delta()
    expect(r3.created).toBe(1)
    expect(itemByCode("V003")).toMatchObject({ status: "chua_bat_dau", topic: "Reels" })

    // ── 4. conflict: same field changed on both sides ───────────────────
    // V001 topic: sheet → "Sheet sửa", system → "Hệ thống sửa"
    sheetRow("V001")![2] = "Sheet sửa"
    fx.items.set(
      [...fx.items.entries()].find(([, d]) => d.code === "V001")![0],
      { ...itemByCode("V001"), topic: "Hệ thống sửa" }
    )
    const r4 = await delta()
    expect(r4.conflicts).toBe(1)
    expect(fx.conflicts[0]).toMatchObject({
      field: "topic",
      system_value: "Hệ thống sửa",
      sheet_value: "Sheet sửa",
      chosen_side: "system", // system_wins default
    })
    expect(itemByCode("V001")?.topic).toBe("Hệ thống sửa") // system kept
    expect(sheetRow("V001")?.[2]).toBe("Hệ thống sửa") // push wrote it back

    // ── 5. delete a row ─────────────────────────────────────────────────
    fx.sheet = fx.sheet.filter((r) => r[0] !== "V002")
    const r5 = await delta()
    expect(r5.unlinked).toBe(1)
    expect(itemByCode("V002")).toMatchObject({ code: "V002", sheet_row_ref: null }) // kept, unlinked
    expect(fx.notifications.some((n) => n.type === "sync_issue" && n.recipient_id === "u-mgr")).toBe(true)

    // ── 6. lost access ─────────────────────────────────────────────────
    fx.googleThrows = { status: 403, message: "Không có quyền (đọc dữ liệu sheet)" }
    await expect(runDeltaSheetSync(P, CFG, "tok", snapshot())).rejects.toMatchObject({
      status: 403,
    })
  })
})
