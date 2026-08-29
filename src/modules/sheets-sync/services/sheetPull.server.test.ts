import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    rows: [] as string[][],
    existingItems: [] as Array<{ id: string; code: string }>,
    setSpy: vi.fn(),
    updateSpy: vi.fn(),
    commitSpy: vi.fn(),
  },
}))

vi.mock("@/lib/server/google/sheets", () => ({
  readSheetValues: vi.fn(async () => fx.rows),
}))
vi.mock("@/modules/sheets-sync/services/sheetMapping.server", () => ({
  memberNameMap: vi.fn(async () => new Map([["việt", "u-viet"]])),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string) => ({
    where: () => query(name),
    get: async () =>
      name === "contentItems"
        ? {
            docs: fx.existingItems.map((i) => ({
              id: i.id,
              data: () => ({ code: i.code }),
            })),
          }
        : { docs: [] },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      batch: () => ({
        set: fx.setSpy,
        update: fx.updateSpy,
        commit: fx.commitSpy,
      }),
      collection: (name: string) => ({
        ...query(name),
        doc: (id?: string) => ({ id: id ?? `${name}-new` }),
      }),
    }),
  }
})

import { runDeltaSheetSync } from "@/modules/sheets-sync/services/sheetPull.server"

const cfg = {
  spreadsheet_id: "1abc",
  sheet_tab: "T",
  header_row: 1,
  column_map: { code: "Mã", status: "TT", topic: "CĐ" },
}

beforeEach(() => {
  fx.rows = []
  fx.existingItems = []
  fx.setSpy.mockReset()
  fx.updateSpy.mockReset()
  fx.commitSpy.mockReset().mockResolvedValue(undefined)
})

describe("runDeltaSheetSync (SPEC §5.5 R2 / §6.3, task 6.4)", () => {
  it("creates a ContentItem for a brand-new sheet row", async () => {
    fx.rows = [
      ["Mã", "TT", "CĐ"],
      ["V001", "quay_dung", "NYC"],
    ]
    const { result, snapshot } = await runDeltaSheetSync("p1", cfg, "tok", {})

    expect(result).toMatchObject({ rows_read: 1, created: 1, updated: 0 })
    const created = fx.setSpy.mock.calls[0][1] as Record<string, unknown>
    expect(created).toMatchObject({
      project_id: "p1",
      code: "V001",
      status: "quay_dung",
      topic: "NYC",
      sheet_row_ref: "V001",
    })
    expect(snapshot.V001).toEqual({ status: "quay_dung", topic: "NYC" })
  })

  it("new row with an invalid status → still created, status falls back, error counted", async () => {
    fx.rows = [
      ["Mã", "TT", "CĐ"],
      ["V004", "đang làm dở", "Photo"],
    ]
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", {})
    expect(result.created).toBe(1)
    expect(result.mapping_errors).toBe(1)
    const created = fx.setSpy.mock.calls[0][1] as Record<string, unknown>
    expect(created.status).toBe("chua_bat_dau") // bad value skipped
    expect(created.topic).toBe("Photo") // the other field still applied
  })

  it("only applies the sheet cells that changed since the last snapshot", async () => {
    fx.existingItems = [{ id: "c1", code: "V001" }]
    fx.rows = [
      ["Mã", "TT", "CĐ"],
      ["V001", "quay_dung", "NYC 2"], // topic changed, status same
    ]
    const prev = { V001: { status: "quay_dung", topic: "NYC" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev)

    expect(result.updated).toBe(1)
    const patch = fx.updateSpy.mock.calls[0][1] as Record<string, unknown>
    expect(patch.topic).toBe("NYC 2")
    expect(patch).not.toHaveProperty("status") // unchanged → not written
  })

  it("does nothing for an unchanged row", async () => {
    fx.existingItems = [{ id: "c1", code: "V001" }]
    fx.rows = [
      ["Mã", "TT", "CĐ"],
      ["V001", "quay_dung", "NYC"],
    ]
    const prev = { V001: { status: "quay_dung", topic: "NYC" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev)
    expect(result.updated).toBe(0)
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("a cell changed to an invalid status is skipped + counted, no other change → no update", async () => {
    fx.existingItems = [{ id: "c1", code: "V001" }]
    fx.rows = [
      ["Mã", "TT", "CĐ"],
      ["V001", "bậy bạ", "NYC"],
    ]
    const prev = { V001: { status: "quay_dung", topic: "NYC" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev)
    expect(result.mapping_errors).toBe(1)
    expect(result.updated).toBe(0)
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("leaves a row that was deleted from the sheet alone (task 6.7)", async () => {
    fx.existingItems = [{ id: "c1", code: "V001" }]
    fx.rows = [["Mã", "TT", "CĐ"]] // no data rows
    const prev = { V001: { status: "quay_dung", topic: "NYC" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev)
    expect(result).toMatchObject({ rows_read: 0, created: 0, updated: 0 })
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("bails out cleanly when the code column is missing", async () => {
    fx.rows = [["TT", "CĐ"]]
    const { result, snapshot } = await runDeltaSheetSync("p1", cfg, "tok", {})
    expect(result.rows_read).toBe(0)
    expect(snapshot).toEqual({})
  })
})
