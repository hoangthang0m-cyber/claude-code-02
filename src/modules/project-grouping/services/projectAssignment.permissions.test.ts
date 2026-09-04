import { beforeEach, describe, expect, it, vi } from "vitest"

// project-grouping change task 3.4 — assigning a project to / from a group is
// `system_role = manager` only (design Decision 3). `setProjectGroup` calls
// `requireSystemManager` first, so a staff caller never reaches Firestore.
// (Creating a project with a group is covered by projects.server.test.ts —
// createProject also guards with requireSystemManager.)

const { fx } = vi.hoisted(() => ({
  fx: { get: vi.fn(), update: vi.fn() },
}))

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      where: () => ({ get: fx.get }),
      get: fx.get,
      doc: () => ({ id: "x", get: fx.get, update: fx.update }),
    }),
  }),
  getAdminAuth: () => ({}),
}))

import type { AuthedUser } from "@/lib/server/auth"
import { setProjectGroup } from "@/modules/project-grouping/services/projectAssignment.server"

const staff: AuthedUser = {
  uid: "u-staff",
  email: "s@hemtarot.vn",
  system_role: "staff",
}

const BODIES = [
  ["assign", { group_id: "gA" }],
  ["move", { group_id: "gB" }],
  ["clear", { group_id: null }],
] as const

beforeEach(() => {
  fx.get.mockReset().mockResolvedValue({ exists: true, data: () => ({}), docs: [] })
  fx.update.mockReset()
})

describe("setProjectGroup is manager-only (task 3.4)", () => {
  it.each(BODIES)("staff %s → 403, no Firestore access", async (_name, body) => {
    await expect(
      setProjectGroup(staff, "p1", body)
    ).rejects.toMatchObject({ status: 403 })
    expect(fx.get).not.toHaveBeenCalled()
    expect(fx.update).not.toHaveBeenCalled()
  })
})
