import { beforeEach, describe, expect, it, vi } from "vitest"

// project-grouping change task 6.4 — one gate over EVERY grouping mutation: a
// Nhân sự (system_role staff) is refused, and the refusal happens before any
// Firestore access (each service calls requireSystemManager first). The
// drag-to-reorder UI (task 4.6) is disabled for staff and its endpoint
// (reorderProject) is covered here too.

const { fx } = vi.hoisted(() => ({
  fx: { get: vi.fn(), update: vi.fn(), set: vi.fn(), del: vi.fn(), commit: vi.fn() },
}))

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      where: () => ({ get: fx.get }),
      get: fx.get,
      doc: () => ({
        id: "x",
        get: fx.get,
        set: fx.set,
        update: fx.update,
        delete: fx.del,
      }),
    }),
    batch: () => ({ update: fx.update, delete: fx.del, set: fx.set, commit: fx.commit }),
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
import {
  reorderProject,
  setProjectGroup,
} from "@/modules/project-grouping/services/projectAssignment.server"

const staff: AuthedUser = {
  uid: "u-staff",
  email: "s@hemtarot.vn",
  system_role: "staff",
}

const ENTRY_POINTS: Array<[string, () => Promise<unknown>]> = [
  ["tạo nhóm", () => createProjectGroup(staff, { name: "X" })],
  ["sửa nhóm", () => updateProjectGroup(staff, "g1", { name: "X" })],
  [
    "lưu trữ nhóm",
    () => setProjectGroupLifecycle(staff, "g1", { lifecycle: "archived" }),
  ],
  ["xoá nhóm", () => deleteProjectGroup(staff, "g1")],
  ["gán dự án vào nhóm", () => setProjectGroup(staff, "p1", { group_id: "g1" })],
  ["gỡ dự án khỏi nhóm", () => setProjectGroup(staff, "p1", { group_id: null })],
  ["kéo-thả sắp thứ tự", () => reorderProject(staff, "p1", { after_id: "p2" })],
]

beforeEach(() => {
  Object.values(fx).forEach((f) => f.mockReset())
  fx.get.mockResolvedValue({ exists: true, data: () => ({}), docs: [], size: 0 })
})

describe("every grouping mutation is manager-only (task 6.4)", () => {
  it.each(ENTRY_POINTS)("Nhân sự — %s → 403", async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ status: 403 })
  })

  it("Nhân sự never touches Firestore on any grouping mutation", async () => {
    for (const [, run] of ENTRY_POINTS) {
      await expect(run()).rejects.toMatchObject({ status: 403 })
    }
    expect(fx.get).not.toHaveBeenCalled()
    expect(fx.set).not.toHaveBeenCalled()
    expect(fx.update).not.toHaveBeenCalled()
    expect(fx.del).not.toHaveBeenCalled()
    expect(fx.commit).not.toHaveBeenCalled()
  })
})
