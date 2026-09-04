import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx, projectUpdate } = vi.hoisted(() => ({
  fx: {
    projects: {} as Record<string, Record<string, unknown>>,
    groups: {} as Record<string, Record<string, unknown>>,
  },
  projectUpdate: vi.fn(),
}))

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        id,
        update: name === "projects" ? projectUpdate : vi.fn(),
        get: async () => {
          const store = name === "projects" ? fx.projects : fx.groups
          return { exists: id in store, data: () => store[id] }
        },
      }),
    }),
  }),
  getAdminAuth: () => ({}),
}))

import type { AuthedUser } from "@/lib/server/auth"
import { setProjectGroup } from "@/modules/project-grouping/services/projectAssignment.server"

const manager: AuthedUser = {
  uid: "u-manager",
  email: "m@hemtarot.vn",
  system_role: "manager",
}
const staff: AuthedUser = {
  uid: "u-staff",
  email: "s@hemtarot.vn",
  system_role: "staff",
}

beforeEach(() => {
  fx.projects = {
    p1: { name: "Chiến dịch UGC tháng 8", group_id: null, lifecycle: "running" },
    pInA: { name: "Trong nhóm A", group_id: "gA", lifecycle: "running" },
    pDone: { name: "Đã hoàn thành", group_id: null, lifecycle: "archived" },
  }
  fx.groups = {
    gA: { name: "A", lifecycle: "active" },
    gB: { name: "B", lifecycle: "active" },
    gOld: { name: "Cũ", lifecycle: "archived" },
  }
  projectUpdate.mockReset().mockResolvedValue(undefined)
})

describe("setProjectGroup (project-grouping task 3.1)", () => {
  it("rejects a staff account with 403", async () => {
    await expect(
      setProjectGroup(staff, "p1", { group_id: "gA" })
    ).rejects.toMatchObject({ status: 403 })
    expect(projectUpdate).not.toHaveBeenCalled()
  })

  it("400 on a bad body (group_id must be string | null)", async () => {
    await expect(
      setProjectGroup(manager, "p1", { group_id: 123 })
    ).rejects.toMatchObject({ status: 400 })
    await expect(setProjectGroup(manager, "p1", {})).rejects.toMatchObject({
      status: 400,
    })
  })

  it("404 when the project does not exist", async () => {
    await expect(
      setProjectGroup(manager, "nope", { group_id: "gA" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("404 when the target group does not exist", async () => {
    await expect(
      setProjectGroup(manager, "p1", { group_id: "ghost" })
    ).rejects.toMatchObject({ status: 404 })
    expect(projectUpdate).not.toHaveBeenCalled()
  })

  it("409 when the target group is archived", async () => {
    await expect(
      setProjectGroup(manager, "p1", { group_id: "gOld" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("assigns an ungrouped project to a group", async () => {
    const r = await setProjectGroup(manager, "p1", { group_id: "gA" })
    expect(r).toEqual({ id: "p1", group_id: "gA" })
    expect(projectUpdate).toHaveBeenCalledWith({ group_id: "gA" })
  })

  it("moves A→B by overwriting the single group_id field (A no longer contains it)", async () => {
    const r = await setProjectGroup(manager, "pInA", { group_id: "gB" })
    expect(r).toEqual({ id: "pInA", group_id: "gB" })
    // one scalar write; membership of A is derived from `where group_id == gA`,
    // which this project no longer matches
    expect(projectUpdate).toHaveBeenCalledWith({ group_id: "gB" })
  })

  it("clears the group (group_id: null → Chưa phân nhóm)", async () => {
    const r = await setProjectGroup(manager, "pInA", { group_id: null })
    expect(r).toEqual({ id: "pInA", group_id: null })
    expect(projectUpdate).toHaveBeenCalledWith({ group_id: null })
  })

  it("allows filing an archived project into a group (history still rolls up)", async () => {
    const r = await setProjectGroup(manager, "pDone", { group_id: "gA" })
    expect(r).toEqual({ id: "pDone", group_id: "gA" })
    expect(projectUpdate).toHaveBeenCalledWith({ group_id: "gA" })
  })
})
