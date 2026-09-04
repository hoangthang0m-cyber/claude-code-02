import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    rows: [] as string[][],
    existingItems: [] as Array<{
      id: string
      code: string
      data?: Record<string, unknown>
    }>,
    managers: ["u-mgr"] as string[],
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
  const query = (name: string, clauses: string[] = []) => ({
    where: (f: string) => query(name, [...clauses, f]),
    get: async () => {
      if (name === "contentItems") {
        return {
          docs: fx.existingItems.map((i) => ({
            id: i.id,
            data: () => ({
              code: i.code,
              sheet_row_ref: i.code,
              ...(i.data ?? {}),
            }),
          })),
        }
      }
      if (name === "projectMembers" && clauses.includes("project_role")) {
        return { docs: fx.managers.map((u) => ({ data: () => ({ user_id: u }) })) }
      }
      return { docs: [] }
    },
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
        doc: (id?: string) => ({
          id: id ?? `${name}-new`,
          // notificationPreferences lookups by the engine: absent → enabled
          get: async () => ({ exists: false, data: () => undefined }),
        }),
      }),
    }),
  }
})

import { runDeltaSheetSync } from "@/modules/sheets-sync/services/sheetPull.server"

const cfg = {
  spreadsheet_id: "1abc",
  sheet_tab: "T",
  header_row: 1,
  column_map: {},
}

beforeEach(() => {
  fx.rows = []
  fx.existingItems = []
  fx.managers = ["u-mgr"]
  fx.setSpy.mockReset()
  fx.updateSpy.mockReset()
  fx.commitSpy.mockReset().mockResolvedValue(undefined)
})

describe("runDeltaSheetSync (SPEC §5.5 R2 / §6.3, task 6.4)", () => {
  it("creates a ContentItem for a brand-new sheet row", async () => {
    fx.rows = [
      ["Mã", "Trạng thái", "Chủ đề"],
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
      ["Mã", "Trạng thái", "Chủ đề"],
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
    fx.existingItems = [
      { id: "c1", code: "V001", data: { status: "quay_dung", topic: "NYC" } },
    ]
    fx.rows = [
      ["Mã", "Trạng thái", "Chủ đề"],
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
      ["Mã", "Trạng thái", "Chủ đề"],
      ["V001", "quay_dung", "NYC"],
    ]
    const prev = { V001: { status: "quay_dung", topic: "NYC" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev)
    expect(result.updated).toBe(0)
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("a cell changed to an invalid status is skipped + counted, no other change → no update", async () => {
    fx.existingItems = [
      { id: "c1", code: "V001", data: { status: "quay_dung", topic: "NYC" } },
    ]
    fx.rows = [
      ["Mã", "Trạng thái", "Chủ đề"],
      ["V001", "bậy bạ", "NYC"],
    ]
    const prev = { V001: { status: "quay_dung", topic: "NYC" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev)
    expect(result.mapping_errors).toBe(1)
    expect(result.updated).toBe(0)
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("conflict (both sides changed the same field): system_wins keeps the system value + logs SyncConflict", async () => {
    fx.existingItems = [
      { id: "c1", code: "V001", data: { topic: "Hệ thống sửa" } },
    ]
    fx.rows = [
      ["Mã", "Trạng thái", "Chủ đề"],
      ["V001", "quay_dung", "Sheet sửa"],
    ]
    const prev = { V001: { status: "quay_dung", topic: "Gốc" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev) // default = system_wins

    expect(result.conflicts).toBe(1)
    expect(result.updated).toBe(0) // system value kept
    const conflict = fx.setSpy.mock.calls[0][1] as Record<string, unknown>
    expect(conflict).toMatchObject({
      project_id: "p1",
      content_item_id: "c1",
      field: "topic",
      system_value: "Hệ thống sửa",
      sheet_value: "Sheet sửa",
      chosen_side: "system",
    })
  })

  it("conflict with sheet_wins: applies the sheet value + logs chosen_side sheet", async () => {
    fx.existingItems = [
      { id: "c1", code: "V001", data: { topic: "Hệ thống sửa" } },
    ]
    fx.rows = [
      ["Mã", "Trạng thái", "Chủ đề"],
      ["V001", "quay_dung", "Sheet sửa"],
    ]
    const prev = { V001: { status: "quay_dung", topic: "Gốc" } }
    const { result } = await runDeltaSheetSync(
      "p1",
      { ...cfg, conflict_rule: "sheet_wins" },
      "tok",
      prev
    )

    expect(result.conflicts).toBe(1)
    expect(result.updated).toBe(1)
    expect((fx.updateSpy.mock.calls[0][1] as Record<string, unknown>).topic).toBe(
      "Sheet sửa"
    )
    expect(
      (fx.setSpy.mock.calls[0][1] as Record<string, unknown>).chosen_side
    ).toBe("sheet")
  })

  it("no conflict when only the sheet changed (system still at the snapshot value)", async () => {
    fx.existingItems = [{ id: "c1", code: "V001", data: { topic: "Gốc" } }]
    fx.rows = [
      ["Mã", "Trạng thái", "Chủ đề"],
      ["V001", "quay_dung", "Sheet sửa"],
    ]
    const prev = { V001: { status: "quay_dung", topic: "Gốc" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev)
    expect(result.conflicts).toBe(0)
    expect(result.updated).toBe(1)
  })

  it("a previously-synced row now gone from the sheet → unlink, keep the item, notify managers (task 6.7)", async () => {
    fx.existingItems = [{ id: "c1", code: "V001" }]
    fx.managers = ["u-mgr", "u-mgr2"]
    fx.rows = [["Mã", "Trạng thái", "Chủ đề"]] // header only — the data row was deleted
    const prev = { V001: { status: "quay_dung", topic: "NYC" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev)

    expect(result).toMatchObject({ rows_read: 0, created: 0, updated: 0, unlinked: 1 })

    // the ContentItem is kept, only unlinked
    const patch = fx.updateSpy.mock.calls[0][1] as Record<string, unknown>
    expect(patch.sheet_row_ref).toBeNull()
    expect(patch).toHaveProperty("sheet_unlinked_at")

    // every project manager is notified
    const notes = fx.setSpy.mock.calls
      .map((c) => c[1] as Record<string, unknown>)
      .filter((d) => d.type === "sync_issue")
    expect(notes.map((n) => n.recipient_id).sort()).toEqual(["u-mgr", "u-mgr2"])
    expect(notes[0]).toMatchObject({ content_item_id: "c1", project_id: "p1" })
  })

  it("a row already unlinked and still gone → no repeat unlink / notification", async () => {
    fx.existingItems = [
      { id: "c1", code: "V001", data: { sheet_row_ref: null } },
    ]
    fx.rows = [["Mã", "Trạng thái", "Chủ đề"]]
    const prev = { V001: { status: "quay_dung", topic: "NYC" } }
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", prev)

    expect(result.unlinked).toBe(0)
    expect(fx.updateSpy).not.toHaveBeenCalled()
    expect(fx.setSpy).not.toHaveBeenCalled()
  })

  it("a deleted row that reappears → re-link (clear sheet_unlinked_at) (task 6.7)", async () => {
    fx.existingItems = [
      {
        id: "c1",
        code: "V001",
        data: { sheet_row_ref: null, status: "quay_dung", topic: "NYC" },
      },
    ]
    fx.rows = [
      ["Mã", "Trạng thái", "Chủ đề"],
      ["V001", "quay_dung", "NYC"],
    ]
    // the row was absent last sync, so it is not in the snapshot
    const { result } = await runDeltaSheetSync("p1", cfg, "tok", {})

    expect(result.unlinked).toBe(0)
    const patch = fx.updateSpy.mock.calls[0][1] as Record<string, unknown>
    expect(patch.sheet_row_ref).toBe("V001")
    expect(patch.sheet_unlinked_at).toBeNull()
  })

  it("bails out cleanly when the code column is missing", async () => {
    fx.rows = [["Trạng thái", "Chủ đề"]]
    const { result, snapshot } = await runDeltaSheetSync("p1", cfg, "tok", {})
    expect(result.rows_read).toBe(0)
    expect(snapshot).toEqual({})
  })
})
