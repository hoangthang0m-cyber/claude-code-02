import { beforeEach, describe, expect, it, vi } from "vitest"

// project-grouping change task 2.5 — the consolidated check that EVERY §2 group
// CRUD entry point is `system_role = manager` only (design.md Decision 3). Each
// function calls `requireSystemManager` as its first statement, so a staff
// caller is rejected before any Firestore access — the spies below must stay
// untouched.

const { writes } = vi.hoisted(() => ({
  writes: {
    set: vi.fn(),
    update: vi.fn(),
    del: vi.fn(),
    batchUpdate: vi.fn(),
    batchDelete: vi.fn(),
    batchCommit: vi.fn(),
    get: vi.fn(),
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      where: () => ({ get: writes.get }),
      doc: () => ({
        id: "x",
        set: writes.set,
        update: writes.update,
        delete: writes.del,
        get: writes.get,
      }),
    }),
    batch: () => ({
      update: writes.batchUpdate,
      delete: writes.batchDelete,
      commit: writes.batchCommit,
    }),
  }),
  getAdminAuth: () => ({}),
}))

import type { AuthedUser } from "@/lib/server/auth"
import {
  createProjectGroup,
  deleteProjectGroup,
  setProjectGroupLifecycle,
  updateProjectGroup,
} from "@/modules/project-grouping/services/projectGroups.server"

const staff: AuthedUser = {
  uid: "u-staff",
  email: "s@hemtarot.vn",
  system_role: "staff",
}

const CALLS: Array<[string, () => Promise<unknown>]> = [
  ["createProjectGroup", () => createProjectGroup(staff, { name: "X" })],
  ["updateProjectGroup", () => updateProjectGroup(staff, "g1", { name: "X" })],
  [
    "setProjectGroupLifecycle",
    () => setProjectGroupLifecycle(staff, "g1", { lifecycle: "archived" }),
  ],
  ["deleteProjectGroup", () => deleteProjectGroup(staff, "g1")],
]

beforeEach(() => {
  Object.values(writes).forEach((fn) => fn.mockReset())
  writes.get.mockResolvedValue({ exists: true, data: () => ({}), docs: [], size: 0 })
})

describe("project-group CRUD is manager-only (task 2.5)", () => {
  it.each(CALLS)("%s rejects a staff caller with 403", async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ status: 403 })
  })

  it("a staff caller triggers no Firestore read or write on any §2 endpoint", async () => {
    for (const [, run] of CALLS) {
      await expect(run()).rejects.toMatchObject({ status: 403 })
    }
    expect(writes.get).not.toHaveBeenCalled()
    expect(writes.set).not.toHaveBeenCalled()
    expect(writes.update).not.toHaveBeenCalled()
    expect(writes.del).not.toHaveBeenCalled()
    expect(writes.batchUpdate).not.toHaveBeenCalled()
    expect(writes.batchDelete).not.toHaveBeenCalled()
    expect(writes.batchCommit).not.toHaveBeenCalled()
  })
})
