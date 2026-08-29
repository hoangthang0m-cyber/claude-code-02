import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    actorRole: "manager" as "manager" | "staff" | null,
    lifecycle: "running" as "running" | "done" | "archived" | null,
    mappingExists: false,
    access: {
      can_read: true,
      can_write: true,
      spreadsheet_id: "1abc",
      spreadsheet_title: "Tiến độ",
      sheet_tab: "Nội dung",
      sheet_gid: 0,
    },
    rows: [] as string[][],
    existingItems: [] as Array<{ id: string; code: string }>,
    members: ["u-viet"] as string[],
    userNames: { "u-viet": "Việt" } as Record<string, string>,
    setSpy: vi.fn(),
    updateSpy: vi.fn(),
    projUpdateSpy: vi.fn(),
    batchSet: vi.fn(),
    batchUpdate: vi.fn(),
    batchCommit: vi.fn(),
  },
}))

vi.mock("@/lib/server/google/sheets", () => ({
  verifySheetAccess: vi.fn(async () => fx.access),
  readSheetValues: vi.fn(async (_t: string, _s: string, range: string) =>
    // a single-row range (…:ZZ<n>) → just the header row; …:ZZ → all rows
    /:ZZ\d+$/.test(range) ? [fx.rows[0] ?? []] : fx.rows
  ),
}))
vi.mock("@/modules/sheets-sync/services/googleConnection.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "access-token"),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string) => query(name, [...clauses, f]),
    limit: () => query(name, clauses),
    get: async () => {
      if (name === "projectMembers" && clauses.includes("user_id")) {
        return fx.actorRole == null
          ? { empty: true, docs: [] }
          : { empty: false, docs: [{ data: () => ({ project_role: fx.actorRole }) }] }
      }
      if (name === "projectMembers") {
        return { docs: fx.members.map((u) => ({ data: () => ({ user_id: u }) })) }
      }
      if (name === "contentItems") {
        return {
          docs: fx.existingItems.map((i) => ({ id: i.id, data: () => ({ code: i.code }) })),
        }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      batch: () => ({
        set: fx.batchSet,
        update: fx.batchUpdate,
        commit: fx.batchCommit,
      }),
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => ({
          id: id ?? `${name}-new`,
          get: async () => {
            if (name === "sheetSyncMappings") {
              return fx.mappingExists
                ? {
                    exists: true,
                    data: () => ({
                      spreadsheet_id: "1abc",
                      sheet_tab: "Nội dung",
                      header_row: 2,
                      column_map: { code: "Mã" },
                      conflict_rule: "sheet_wins",
                    }),
                  }
                : { exists: false }
            }
            if (name === "projects") {
              return {
                exists: fx.lifecycle != null,
                data: () => ({
                  lifecycle: fx.lifecycle,
                  progress_sheet_url: "https://old",
                }),
              }
            }
            if (name === "users") {
              return { data: () => ({ name: fx.userNames[id ?? ""] ?? "" }) }
            }
            return { exists: false }
          },
          set: name === "projects" ? fx.projUpdateSpy : fx.setSpy,
          update: name === "projects" ? fx.projUpdateSpy : fx.updateSpy,
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  getSheetMapping,
  parseSheetDate,
  previewSheet,
  runFirstSheetSync,
  saveSheetMapping,
  setSheetSyncEnabled,
} from "@/modules/sheets-sync/services/sheetMapping.server"

const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1abc/edit#gid=0"

beforeEach(() => {
  fx.actorRole = "manager"
  fx.lifecycle = "running"
  fx.mappingExists = false
  fx.access = {
    can_read: true,
    can_write: true,
    spreadsheet_id: "1abc",
    spreadsheet_title: "Tiến độ",
    sheet_tab: "Nội dung",
    sheet_gid: 0,
  }
  fx.rows = []
  fx.existingItems = []
  fx.members = ["u-viet"]
  fx.userNames = { "u-viet": "Việt" }
  fx.setSpy.mockReset().mockResolvedValue(undefined)
  fx.updateSpy.mockReset().mockResolvedValue(undefined)
  fx.projUpdateSpy.mockReset().mockResolvedValue(undefined)
  fx.batchSet.mockReset()
  fx.batchUpdate.mockReset()
  fx.batchCommit.mockReset().mockResolvedValue(undefined)
})

describe("parseSheetDate", () => {
  it("reads DD/MM/YYYY, YYYY-MM-DD and ISO", () => {
    expect(parseSheetDate("31/12/2026")?.toISOString().slice(0, 10)).toBe("2026-12-31")
    expect(parseSheetDate("2026-09-01")?.toISOString().slice(0, 10)).toBe("2026-09-01")
    expect(parseSheetDate("2026-09-01T00:00:00.000Z")).toBeInstanceOf(Date)
  })
  it("returns null for garbage", () => {
    expect(parseSheetDate("hôm qua")).toBeNull()
    expect(parseSheetDate("")).toBeNull()
  })
})

describe("getSheetMapping", () => {
  it("403 for a non-member", async () => {
    fx.actorRole = null
    await expect(getSheetMapping(mgr, "p1")).rejects.toMatchObject({ status: 403 })
  })
  it("null when the project has no mapping", async () => {
    expect((await getSheetMapping(mgr, "p1")).mapping).toBeNull()
  })
  it("returns the stored mapping", async () => {
    fx.mappingExists = true
    const { mapping } = await getSheetMapping(mgr, "p1")
    expect(mapping).toMatchObject({
      sheet_tab: "Nội dung",
      header_row: 2,
      conflict_rule: "sheet_wins",
      // task 6.9: a mapping saved before the flag reads as enabled
      sync_enabled: true,
      sync_disabled_reason: null,
    })
  })
})

describe("setSheetSyncEnabled (SPEC §5.5 R4, task 6.9)", () => {
  it("403 for a non-manager", async () => {
    fx.actorRole = "staff"
    await expect(setSheetSyncEnabled(mgr, "p1", false)).rejects.toMatchObject({
      status: 403,
    })
  })

  it("409 when the project has no mapping", async () => {
    fx.mappingExists = false
    await expect(setSheetSyncEnabled(mgr, "p1", false)).rejects.toMatchObject({
      status: 409,
    })
  })

  it("turning off records the manual pause reason", async () => {
    fx.mappingExists = true
    const r = await setSheetSyncEnabled(mgr, "p1", false)
    expect(r).toEqual({ sync_enabled: false })
    const patch = fx.setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(patch.sync_enabled).toBe(false)
    expect(patch.sync_disabled_reason).toBe("manual")
  })

  it("turning back on clears the pause reason", async () => {
    fx.mappingExists = true
    await setSheetSyncEnabled(mgr, "p1", true)
    const patch = fx.setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(patch.sync_enabled).toBe(true)
    // FieldValue.delete() sentinel — just assert it is not the literal string
    expect(patch.sync_disabled_reason).not.toBe("manual")
  })
})

describe("previewSheet", () => {
  it("403 for a non-manager", async () => {
    fx.actorRole = "staff"
    await expect(previewSheet(mgr, "p1", SHEET_URL, 1)).rejects.toMatchObject({
      status: 403,
    })
  })
  it("400 for a non-Sheets URL", async () => {
    await expect(
      previewSheet(mgr, "p1", "https://example.com", 1)
    ).rejects.toMatchObject({ status: 400 })
  })
  it("returns the header row column names", async () => {
    fx.rows = [["Mã", "Deadline", "Trạng thái", ""]]
    const p = await previewSheet(mgr, "p1", SHEET_URL, 1)
    expect(p.header_columns).toEqual(["Mã", "Deadline", "Trạng thái"])
    expect(p.sheet_tab).toBe("Nội dung")
  })
})

describe("saveSheetMapping", () => {
  const base = {
    url: SHEET_URL,
    header_row: 1,
    column_map: { code: "Mã", status: "Trạng thái" },
    conflict_rule: "system_wins",
  }

  it("403 for a non-manager", async () => {
    fx.actorRole = "staff"
    await expect(saveSheetMapping(mgr, "p1", base)).rejects.toMatchObject({
      status: 403,
    })
  })

  it("409 when the project is archived", async () => {
    fx.lifecycle = "archived"
    await expect(saveSheetMapping(mgr, "p1", base)).rejects.toMatchObject({
      status: 409,
    })
  })

  it("400 when the code column is not mapped", async () => {
    await expect(
      saveSheetMapping(mgr, "p1", { ...base, column_map: { status: "Trạng thái" } })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("403 when the manager only has read access", async () => {
    fx.access = { ...fx.access, can_write: false }
    await expect(saveSheetMapping(mgr, "p1", base)).rejects.toMatchObject({
      status: 403,
    })
  })

  it("saves the mapping, updates the project URL and runs the first sync", async () => {
    fx.rows = [
      ["Mã", "Trạng thái"],
      ["V001", "viet_kich_ban"],
    ]
    const r = await saveSheetMapping(mgr, "p1", base)
    expect(r.sheet_tab).toBe("Nội dung")
    // mapping doc written
    expect(fx.setSpy).toHaveBeenCalled()
    // project.progress_sheet_url updated
    expect(fx.projUpdateSpy).toHaveBeenCalledWith({ progress_sheet_url: SHEET_URL })
    expect(r.first_sync.created).toBe(1)
  })
})

describe("runFirstSheetSync (SPEC §5.5 R1)", () => {
  const cfg = {
    spreadsheet_id: "1abc",
    sheet_tab: "Nội dung",
    header_row: 1,
    column_map: {
      code: "Mã",
      status: "Trạng thái",
      deadline: "Hạn",
      content_format: "Định dạng",
      assignee: "Nhân sự",
      topic: "Chủ đề",
    },
  }

  it("creates new items and updates existing ones by code", async () => {
    fx.existingItems = [{ id: "c-existing", code: "V001" }]
    fx.rows = [
      ["Mã", "Trạng thái", "Hạn", "Định dạng", "Nhân sự", "Chủ đề"],
      ["V001", "quay_dung", "15/09/2026", "reels", "Việt", "NYC"],
      ["V002", "chua_bat_dau", "", "", "", "Người thứ 3"],
    ]
    const r = await runFirstSheetSync("p1", cfg, "tok")

    expect(r.rows_read).toBe(2)
    expect(r.content_items).toBe(2)
    expect(r.updated).toBe(1)
    expect(r.created).toBe(1)
    expect(r.mapping_errors).toBe(0)

    const updatePatch = fx.batchUpdate.mock.calls[0][1] as Record<string, unknown>
    expect(updatePatch).toMatchObject({
      status: "quay_dung",
      content_format: "reels",
      assignee_id: "u-viet",
      topic: "NYC",
      sheet_row_ref: "V001",
    })
    expect(updatePatch.deadline).toBeDefined()

    // a SyncRun row + the create both go through batch.set
    expect(fx.batchSet).toHaveBeenCalled()
    expect(fx.batchCommit).toHaveBeenCalledTimes(1)
  })

  it("skips rows without a code", async () => {
    fx.rows = [
      ["Mã", "Trạng thái"],
      ["", "quay_dung"],
      ["V009", "quay_dung"],
    ]
    const r = await runFirstSheetSync("p1", cfg, "tok")
    expect(r.rows_read).toBe(2)
    expect(r.content_items).toBe(1)
  })

  it("skips an invalid status / content_format value with a warning (§5.5 R1)", async () => {
    fx.rows = [
      ["Mã", "Trạng thái", "Định dạng"],
      ["V001", "đang làm dở", "tiktok"],
    ]
    const r = await runFirstSheetSync("p1", cfg, "tok")
    expect(r.mapping_errors).toBe(2)
    const patch = fx.batchSet.mock.calls[0][1] as Record<string, unknown>
    expect(patch).not.toHaveProperty("content_format")
    // status falls back to the initial state, not the bad value
    expect(patch.status).toBe("chua_bat_dau")
  })

  it("warns when an assignee name has no matching member", async () => {
    fx.rows = [
      ["Mã", "Nhân sự"],
      ["V001", "Người lạ"],
    ]
    const r = await runFirstSheetSync("p1", cfg, "tok")
    expect(r.mapping_errors).toBe(1)
    expect(r.messages[0]).toContain("Người lạ")
  })

  it("warns on an unparseable deadline", async () => {
    fx.rows = [
      ["Mã", "Hạn"],
      ["V001", "cuối tháng"],
    ]
    const r = await runFirstSheetSync("p1", cfg, "tok")
    expect(r.mapping_errors).toBe(1)
  })

  it("records a warning SyncRun when there were mapping errors", async () => {
    fx.rows = [
      ["Mã", "Trạng thái"],
      ["V001", "bậy bạ"],
    ]
    await runFirstSheetSync("p1", cfg, "tok")
    const syncRun = fx.batchSet.mock.calls
      .map((c) => c[1] as Record<string, unknown>)
      .find((d) => d.kind === "sheets")
    expect(syncRun).toMatchObject({ kind: "sheets", result: "warning" })
  })
})
