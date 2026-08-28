import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    rows: [] as string[][],
    items: [] as Array<Record<string, unknown>>,
    members: ["u-viet"] as string[],
    userNames: { "u-viet": "Việt" } as Record<string, string>,
    updates: [] as Array<{ range: string; value: string }>,
  },
}))

vi.mock("@/lib/server/google/sheets", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    readSheetValues: vi.fn(async () => fx.rows),
    batchUpdateValues: vi.fn(async (_t, _s, updates: typeof fx.updates) => {
      fx.updates = updates
      return updates.length
    }),
  }
})

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string) => ({
    where: () => query(name),
    get: async () => {
      if (name === "projectMembers") {
        return { docs: fx.members.map((u) => ({ data: () => ({ user_id: u }) })) }
      }
      if (name === "contentItems") {
        return { docs: fx.items.map((d, i) => ({ id: `c${i}`, data: () => d })) }
      }
      return { docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name),
        doc: (id?: string) => ({
          get: async () =>
            name === "users"
              ? { data: () => ({ name: fx.userNames[id ?? ""] ?? "" }) }
              : { exists: false },
        }),
      }),
    }),
  }
})

import { syncSystemToSheet } from "@/modules/sheets-sync/services/sheetPush.server"

const ts = (iso: string) => ({ toDate: () => new Date(iso) })
const cfg = {
  spreadsheet_id: "1abc",
  sheet_tab: "T",
  header_row: 1,
  column_map: {
    code: "Mã",
    deadline: "Hạn",
    status: "TT",
    assignee: "NS",
    content_format: "ĐD",
    topic: "CĐ",
  },
}

beforeEach(() => {
  fx.rows = []
  fx.items = []
  fx.members = ["u-viet"]
  fx.userNames = { "u-viet": "Việt" }
  fx.updates = []
})

describe("syncSystemToSheet (SPEC §5.5 R2 / §6.3, task 6.3)", () => {
  it("writes only the mapped cells whose system value differs", async () => {
    fx.rows = [
      ["Mã", "Hạn", "TT", "NS", "ĐD", "CĐ"],
      ["V001", "01/09/2026", "viet_kich_ban", "", "", "NYC"],
    ]
    fx.items = [
      {
        code: "V001",
        deadline: ts("2026-09-15T00:00:00Z"), // changed
        status: "quay_dung", // changed
        assignee_id: "u-viet", // changed (was blank)
        content_format: "reels", // changed
        topic: "NYC", // same → not written
      },
    ]
    const r = await syncSystemToSheet("p1", cfg, "tok")

    expect(r.rows_matched).toBe(1)
    // written in field-iteration order: deadline, assignee, content_format, status
    expect(fx.updates).toEqual([
      { range: "'T'!B2", value: "15/09/2026" },
      { range: "'T'!D2", value: "Việt" },
      { range: "'T'!E2", value: "reels" },
      { range: "'T'!C2", value: "quay_dung" },
    ])
    expect(r.cells_written).toBe(4)
  })

  it("writes nothing when every mapped cell already matches", async () => {
    fx.rows = [
      ["Mã", "Hạn", "TT"],
      ["V001", "15/09/2026", "quay_dung"],
    ]
    fx.items = [
      { code: "V001", deadline: ts("2026-09-15T00:00:00Z"), status: "quay_dung" },
    ]
    const r = await syncSystemToSheet("p1", cfg, "tok")
    expect(r.rows_matched).toBe(1)
    expect(r.cells_written).toBe(0)
  })

  it("ignores content items with no matching sheet row", async () => {
    fx.rows = [
      ["Mã", "TT"],
      ["V001", "chua_bat_dau"],
    ]
    fx.items = [
      { code: "V999", status: "quay_dung" },
      { code: "V001", status: "quay_dung" },
    ]
    const r = await syncSystemToSheet("p1", cfg, "tok")
    expect(r.rows_matched).toBe(1)
    expect(fx.updates).toEqual([{ range: "'T'!B2", value: "quay_dung" }])
  })

  it("bails out when the code column is not in the sheet", async () => {
    fx.rows = [["Deadline", "Trạng thái"]]
    fx.items = [{ code: "V001", status: "quay_dung" }]
    const r = await syncSystemToSheet("p1", cfg, "tok")
    expect(r).toEqual({ rows_matched: 0, cells_written: 0 })
  })

  it("clears a cell when the system value is now empty", async () => {
    fx.rows = [
      ["Mã", "CĐ"],
      ["V001", "NYC"],
    ]
    fx.items = [{ code: "V001", topic: null }]
    await syncSystemToSheet("p1", cfg, "tok")
    expect(fx.updates).toEqual([{ range: "'T'!B2", value: "" }])
  })
})
