import { describe, expect, it, vi } from "vitest"

import {
  batchUpdateValues,
  columnLetter,
  getDriveCapabilities,
  getSpreadsheetMeta,
  verifySheetAccess,
} from "@/lib/server/google/sheets"

const jsonRes = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response

const META = {
  properties: { title: "Tiến độ Q3" },
  sheets: [
    { properties: { sheetId: 0, title: "Sheet1" } },
    { properties: { sheetId: 42, title: "Nội dung" } },
  ],
}

describe("getSpreadsheetMeta", () => {
  it("maps the title + tabs", async () => {
    const f = vi.fn(async (u: string) => {
      expect(u).toContain("/spreadsheets/1abc")
      return jsonRes(META)
    })
    const m = await getSpreadsheetMeta("t", "1abc", f as never)
    expect(m.title).toBe("Tiến độ Q3")
    expect(m.tabs).toEqual([
      { sheet_id: 0, title: "Sheet1" },
      { sheet_id: 42, title: "Nội dung" },
    ])
  })

  it("maps a 403 to HttpError 403", async () => {
    const f = vi.fn(async () => jsonRes({ error: { code: 403 } }, false, 403))
    await expect(
      getSpreadsheetMeta("t", "1abc", f as never)
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe("getDriveCapabilities", () => {
  it("reads canEdit", async () => {
    const f = vi.fn(async () => jsonRes({ capabilities: { canEdit: true } }))
    expect(await getDriveCapabilities("t", "1abc", f as never)).toEqual({
      can_edit: true,
    })
  })
})

describe("verifySheetAccess (SPEC §5.1 R1 / §5.5 R1)", () => {
  const stub = (canEdit: boolean) =>
    vi.fn(async (u: string) =>
      u.includes("drive")
        ? jsonRes({ capabilities: { canEdit } })
        : jsonRes(META)
    )

  it("resolves the tab name from the gid and reports read + write", async () => {
    const r = await verifySheetAccess("t", "1abc", 42, stub(true) as never)
    expect(r).toMatchObject({
      can_read: true,
      can_write: true,
      spreadsheet_title: "Tiến độ Q3",
      sheet_tab: "Nội dung",
      sheet_gid: 42,
    })
  })

  it("defaults to the first tab when the URL has no gid", async () => {
    const r = await verifySheetAccess("t", "1abc", null, stub(true) as never)
    expect(r.sheet_tab).toBe("Sheet1")
  })

  it("reports can_write=false for a read-only file", async () => {
    const r = await verifySheetAccess("t", "1abc", 0, stub(false) as never)
    expect(r.can_write).toBe(false)
  })

  it("400 when the gid is not a tab in this sheet", async () => {
    await expect(
      verifySheetAccess("t", "1abc", 999, stub(true) as never)
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("columnLetter", () => {
  it("maps 0-based index to A1 letters", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(columnLetter)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
    ])
  })
})

describe("batchUpdateValues (SPEC §6.3)", () => {
  it("no-ops on an empty list", async () => {
    const f = vi.fn()
    expect(await batchUpdateValues("t", "1abc", [], f as never)).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })

  it("posts one values entry per cell", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      expect(body.valueInputOption).toBe("USER_ENTERED")
      expect(body.data).toEqual([
        { range: "'T'!C4", values: [["01/09/2026"]] },
        { range: "'T'!E4", values: [["reels"]] },
      ])
      return jsonRes({ totalUpdatedCells: 2 })
    })
    const n = await batchUpdateValues(
      "t",
      "1abc",
      [
        { range: "'T'!C4", value: "01/09/2026" },
        { range: "'T'!E4", value: "reels" },
      ],
      f as never
    )
    expect(n).toBe(2)
  })

  it("maps a 403 to HttpError 403", async () => {
    const f = vi.fn(async () => jsonRes({ error: { code: 403 } }, false, 403))
    await expect(
      batchUpdateValues("t", "1abc", [{ range: "A1", value: "x" }], f as never)
    ).rejects.toMatchObject({ status: 403 })
  })
})
