import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    actorRole: "manager" as "manager" | "staff" | null,
    mappingExists: true,
    managers: ["u-mgr"] as string[],
    mappings: ["p1", "p2"] as string[],
    pushResult: { rows_matched: 3, cells_written: 5 },
    pushThrows: false,
    tokenThrows: false,
    syncRunSpy: vi.fn(),
  },
}))

vi.mock("@/modules/sheets-sync/services/sheetPush.server", () => ({
  syncSystemToSheet: vi.fn(async () => {
    if (fx.pushThrows) {
      const { HttpError } = await import("@/lib/server/http")
      throw new HttpError(502, "Google sập")
    }
    return fx.pushResult
  }),
}))
vi.mock("@/modules/sheets-sync/services/googleConnection.server", () => ({
  getGoogleAccessToken: vi.fn(async () => {
    if (fx.tokenThrows) {
      const { HttpError } = await import("@/lib/server/http")
      throw new HttpError(409, "cần kết nối lại")
    }
    return "token"
  }),
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
      if (name === "projectMembers" && clauses.includes("project_role")) {
        return { docs: fx.managers.map((u) => ({ data: () => ({ user_id: u }) })) }
      }
      if (name === "sheetSyncMappings") {
        return {
          size: fx.mappings.length,
          docs: fx.mappings.map((id) => ({ id })),
        }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: () => ({
          id: `${name}-1`,
          get: async () =>
            name === "sheetSyncMappings"
              ? {
                  exists: fx.mappingExists,
                  data: () => ({
                    spreadsheet_id: "1abc",
                    sheet_tab: "T",
                    header_row: 1,
                    column_map: { code: "Mã" },
                  }),
                }
              : { exists: false },
          set: fx.syncRunSpy,
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  syncAllProjectSheets,
  syncProjectSheetNow,
} from "@/modules/sheets-sync/services/sheetSync.server"

const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }

beforeEach(() => {
  fx.actorRole = "manager"
  fx.mappingExists = true
  fx.managers = ["u-mgr"]
  fx.mappings = ["p1", "p2"]
  fx.pushResult = { rows_matched: 3, cells_written: 5 }
  fx.pushThrows = false
  fx.tokenThrows = false
  fx.syncRunSpy.mockReset().mockResolvedValue(undefined)
})

describe("syncProjectSheetNow (SPEC §5.5 R2)", () => {
  it("403 for a non-manager", async () => {
    fx.actorRole = "staff"
    await expect(syncProjectSheetNow(mgr, "p1")).rejects.toMatchObject({
      status: 403,
    })
  })

  it("409 when the project has no mapping", async () => {
    fx.mappingExists = false
    await expect(syncProjectSheetNow(mgr, "p1")).rejects.toMatchObject({
      status: 409,
    })
  })

  it("409 when the project has no manager to sync as", async () => {
    fx.managers = []
    await expect(syncProjectSheetNow(mgr, "p1")).rejects.toMatchObject({
      status: 409,
    })
  })

  it("writes an ok SyncRun and returns the push result", async () => {
    const r = await syncProjectSheetNow(mgr, "p1")
    expect(r.push).toEqual({ rows_matched: 3, cells_written: 5 })
    const run = fx.syncRunSpy.mock.calls[0][0] as Record<string, unknown>
    expect(run).toMatchObject({
      project_id: "p1",
      kind: "sheets",
      result: "ok",
      rows_written: 5,
    })
  })

  it("writes an error SyncRun and throws 502 when the push fails", async () => {
    fx.pushThrows = true
    await expect(syncProjectSheetNow(mgr, "p1")).rejects.toMatchObject({
      status: 502,
    })
    expect(fx.syncRunSpy.mock.calls[0][0]).toMatchObject({ result: "error" })
  })

  it("records the token-revoked error too", async () => {
    fx.tokenThrows = true
    await expect(syncProjectSheetNow(mgr, "p1")).rejects.toMatchObject({
      status: 502,
    })
    expect(fx.syncRunSpy.mock.calls[0][0]).toMatchObject({
      result: "error",
      message: "cần kết nối lại",
    })
  })
})

describe("syncAllProjectSheets (cron)", () => {
  it("runs every mapped project and tallies results", async () => {
    const s = await syncAllProjectSheets()
    expect(s).toEqual({ projects: 2, ok: 2, errors: 0 })
  })

  it("counts failures without aborting the batch", async () => {
    fx.pushThrows = true
    const s = await syncAllProjectSheets()
    expect(s).toEqual({ projects: 2, ok: 0, errors: 2 })
  })
})
