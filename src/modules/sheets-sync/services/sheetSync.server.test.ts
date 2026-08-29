import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    actorRole: "manager" as "manager" | "staff" | null,
    mappingExists: true,
    managers: ["u-mgr"] as string[],
    mappings: ["p1", "p2"] as string[],
    disabledMappings: [] as string[],
    mappingData: {} as Record<string, unknown>,
    lifecycles: {} as Record<string, string>,
    runs: [] as Array<Record<string, unknown>>,
    conflicts: [] as Array<Record<string, unknown>>,
    pushResult: { rows_matched: 3, cells_written: 5 },
    pullResult: {
      rows_read: 4,
      created: 1,
      updated: 1,
      mapping_errors: 0,
      messages: [] as string[],
    },
    pushThrows: false,
    pushErrorStatus: 502,
    tokenThrows: false,
    syncRunSpy: vi.fn(),
    snapshotSpy: vi.fn(),
    batchSetSpy: vi.fn(),
    batchUpdateSpy: vi.fn(),
    batchCommitSpy: vi.fn(),
  },
}))

const ts = (ms: number) => ({ toMillis: () => ms })

vi.mock("@/modules/sheets-sync/services/sheetPush.server", () => ({
  syncSystemToSheet: vi.fn(async () => {
    if (fx.pushThrows) {
      const { HttpError } = await import("@/lib/server/http")
      throw new HttpError(fx.pushErrorStatus, "Google từ chối")
    }
    return fx.pushResult
  }),
}))
vi.mock("@/modules/sheets-sync/services/sheetPull.server", () => ({
  runDeltaSheetSync: vi.fn(async () => ({
    result: fx.pullResult,
    snapshot: {},
  })),
  captureSnapshot: vi.fn(async () => ({})),
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
  const snap = (docs: unknown[]) => ({
    size: docs.length,
    empty: docs.length === 0,
    docs,
  })
  const query = (name: string, clauses: string[]) => ({
    where: (f: string) => query(name, [...clauses, f]),
    limit: () => query(name, clauses),
    get: async () => {
      if (name === "projectMembers" && clauses.includes("user_id")) {
        return fx.actorRole == null
          ? snap([])
          : snap([{ data: () => ({ project_role: fx.actorRole }) }])
      }
      if (name === "projectMembers" && clauses.includes("project_role")) {
        return snap(fx.managers.map((u) => ({ data: () => ({ user_id: u }) })))
      }
      if (name === "sheetSyncMappings") {
        return snap(
          fx.mappings.map((id) => ({
            id,
            data: () => ({ sync_enabled: !fx.disabledMappings.includes(id) }),
          }))
        )
      }
      if (name === "syncRuns") {
        return snap(
          fx.runs.map((r, i) => ({ id: (r.id as string) ?? `run-${i}`, data: () => r }))
        )
      }
      if (name === "syncConflicts") {
        return snap(
          fx.conflicts.map((c, i) => ({
            id: (c.id as string) ?? `cf-${i}`,
            data: () => c,
          }))
        )
      }
      return snap([])
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      batch: () => ({
        set: fx.batchSetSpy,
        update: fx.batchUpdateSpy,
        commit: fx.batchCommitSpy,
      }),
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => ({
          id: id ?? `${name}-1`,
          get: async () => {
            if (name === "sheetSyncMappings") {
              return {
                exists: fx.mappingExists,
                data: () => ({
                  spreadsheet_id: "1abc",
                  sheet_tab: "T",
                  header_row: 1,
                  column_map: { code: "Mã" },
                  ...fx.mappingData,
                }),
              }
            }
            if (name === "projects") {
              return {
                exists: true,
                data: () => ({ lifecycle: fx.lifecycles[id ?? ""] ?? "running" }),
              }
            }
            return { exists: false }
          },
          set: name === "syncRuns" ? fx.syncRunSpy : fx.snapshotSpy,
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  getProjectSheetSyncLog,
  syncAllProjectSheets,
  syncProjectSheetNow,
} from "@/modules/sheets-sync/services/sheetSync.server"

const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }

beforeEach(() => {
  fx.actorRole = "manager"
  fx.mappingExists = true
  fx.managers = ["u-mgr"]
  fx.mappings = ["p1", "p2"]
  fx.disabledMappings = []
  fx.mappingData = {}
  fx.lifecycles = {}
  fx.runs = []
  fx.conflicts = []
  fx.pushResult = { rows_matched: 3, cells_written: 5 }
  fx.pullResult = {
    rows_read: 4,
    created: 1,
    updated: 1,
    mapping_errors: 0,
    messages: [],
  }
  fx.pushThrows = false
  fx.pushErrorStatus = 502
  fx.tokenThrows = false
  fx.syncRunSpy.mockReset().mockResolvedValue(undefined)
  fx.snapshotSpy.mockReset().mockResolvedValue(undefined)
  fx.batchSetSpy.mockReset()
  fx.batchUpdateSpy.mockReset()
  fx.batchCommitSpy.mockReset().mockResolvedValue(undefined)
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

  it("runs both directions, writes an ok SyncRun and persists the snapshot", async () => {
    const r = await syncProjectSheetNow(mgr, "p1")
    expect(r.push).toEqual({ rows_matched: 3, cells_written: 5 })
    expect(r.pull).toMatchObject({ created: 1, updated: 1 })
    const run = fx.syncRunSpy.mock.calls[0][0] as Record<string, unknown>
    expect(run).toMatchObject({
      project_id: "p1",
      kind: "sheets",
      result: "ok",
      rows_read: 4,
      rows_written: 1 + 1 + 5,
    })
    // the post-sync snapshot is written back to the mapping doc
    expect(fx.snapshotSpy).toHaveBeenCalledWith(
      { snapshot: {} },
      { merge: true }
    )
  })

  it("marks the SyncRun a warning when the pull had mapping errors", async () => {
    fx.pullResult = {
      rows_read: 3,
      created: 0,
      updated: 1,
      mapping_errors: 2,
      messages: ["x"],
    }
    await syncProjectSheetNow(mgr, "p1")
    expect(fx.syncRunSpy.mock.calls[0][0]).toMatchObject({ result: "warning" })
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

  it("409 when sync is turned off for the project (task 6.9)", async () => {
    fx.mappingData = { sync_enabled: false }
    await expect(syncProjectSheetNow(mgr, "p1")).rejects.toMatchObject({
      status: 409,
    })
    expect(fx.syncRunSpy).not.toHaveBeenCalled() // nothing ran
  })

  it("lost sheet access → pauses the project + notifies managers (task 6.9)", async () => {
    fx.managers = ["u-mgr", "u-mgr2"]
    fx.pushThrows = true
    fx.pushErrorStatus = 403

    await expect(syncProjectSheetNow(mgr, "p1")).rejects.toMatchObject({
      status: 502,
    })

    const writes = fx.batchSetSpy.mock.calls.map((c) => c[1] as Record<string, unknown>)
    expect(writes).toContainEqual(
      expect.objectContaining({
        sync_enabled: false,
        sync_disabled_reason: "permission_lost",
      })
    )
    const notes = writes.filter((w) => w.type === "sync_issue")
    expect(notes.map((n) => n.recipient_id).sort()).toEqual(["u-mgr", "u-mgr2"])
    expect(fx.batchCommitSpy).toHaveBeenCalled()
    expect(fx.syncRunSpy.mock.calls[0][0]).toMatchObject({ result: "error" })
  })
})

describe("syncAllProjectSheets (cron)", () => {
  it("runs every mapped running project and tallies results", async () => {
    const s = await syncAllProjectSheets()
    expect(s).toEqual({ projects: 2, ok: 2, errors: 0, skipped: 0 })
  })

  it("counts failures without aborting the batch", async () => {
    fx.pushThrows = true
    const s = await syncAllProjectSheets()
    expect(s).toEqual({ projects: 2, ok: 0, errors: 2, skipped: 0 })
  })

  it("skips a project that is not running (task 6.8)", async () => {
    fx.lifecycles = { p2: "archived" }
    const s = await syncAllProjectSheets()
    expect(s).toEqual({ projects: 2, ok: 1, errors: 0, skipped: 1 })
    expect(fx.syncRunSpy).toHaveBeenCalledTimes(1) // only the running project
  })

  it("skips a project whose sync is turned off (task 6.9)", async () => {
    fx.disabledMappings = ["p1"]
    const s = await syncAllProjectSheets()
    expect(s).toEqual({ projects: 2, ok: 1, errors: 0, skipped: 1 })
    expect(fx.syncRunSpy).toHaveBeenCalledTimes(1)
  })
})

describe("getProjectSheetSyncLog (SPEC §5.5 R4, task 6.8)", () => {
  it("403 for a non-member", async () => {
    fx.actorRole = null
    await expect(getProjectSheetSyncLog(mgr, "p1")).rejects.toMatchObject({
      status: 403,
    })
  })

  it("returns sheets runs newest-first with last_run + rows read/written", async () => {
    fx.actorRole = "staff"
    fx.runs = [
      {
        id: "r1",
        project_id: "p1",
        kind: "sheets",
        started_at: ts(1000),
        finished_at: ts(1500),
        result: "ok",
        rows_read: 3,
        rows_written: 7,
        message: "xong",
      },
      {
        id: "r2",
        project_id: "p1",
        kind: "sheets",
        started_at: ts(5000),
        finished_at: ts(5500),
        result: "warning",
        rows_read: 1,
        rows_written: 0,
      },
      { id: "r3", project_id: "p1", kind: "ads", started_at: ts(9000) },
    ]
    const log = await getProjectSheetSyncLog(mgr, "p1")
    expect(log.configured).toBe(true)
    expect(log.runs.map((r) => r.id)).toEqual(["r2", "r1"]) // newest first, ads excluded
    expect(log.last_run).toMatchObject({ id: "r2", result: "warning" })
    expect(log.runs[1]).toMatchObject({ rows_read: 3, rows_written: 7, finished_at: 1500 })
  })

  it("returns conflicts newest-first", async () => {
    fx.conflicts = [
      {
        id: "c1",
        project_id: "p1",
        content_item_id: "ci1",
        field: "deadline",
        system_value: "a",
        sheet_value: "b",
        chosen_side: "system",
        created_at: ts(200),
      },
      {
        id: "c2",
        project_id: "p1",
        content_item_id: "ci2",
        field: "topic",
        system_value: "x",
        sheet_value: "y",
        chosen_side: "sheet",
        created_at: ts(900),
      },
    ]
    const log = await getProjectSheetSyncLog(mgr, "p1")
    expect(log.conflicts.map((c) => c.id)).toEqual(["c2", "c1"])
    expect(log.conflicts[0]).toMatchObject({ field: "topic", chosen_side: "sheet" })
  })

  it("configured is false when the project has no mapping", async () => {
    fx.mappingExists = false
    const log = await getProjectSheetSyncLog(mgr, "p1")
    expect(log.configured).toBe(false)
    expect(log.last_run).toBeNull()
  })

  it("reports the paused state + reason (task 6.9)", async () => {
    fx.mappingData = { sync_enabled: false, sync_disabled_reason: "permission_lost" }
    const log = await getProjectSheetSyncLog(mgr, "p1")
    expect(log.sync_enabled).toBe(false)
    expect(log.sync_disabled_reason).toBe("permission_lost")
  })

  it("defaults sync_enabled to true for a mapping without the flag", async () => {
    const log = await getProjectSheetSyncLog(mgr, "p1")
    expect(log.sync_enabled).toBe(true)
    expect(log.sync_disabled_reason).toBeNull()
  })
})
