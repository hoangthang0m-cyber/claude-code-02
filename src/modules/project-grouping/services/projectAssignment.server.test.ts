import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx, projectUpdate } = vi.hoisted(() => ({
  fx: {
    projects: {} as Record<string, Record<string, unknown>>,
    groups: {} as Record<string, Record<string, unknown>>,
  },
  projectUpdate: vi.fn(),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const projectDocs = () =>
    Object.entries(fx.projects).map(([id, data]) => ({ id, data: () => data }))

  const query = (name: string, gid: unknown) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, f === "group_id" ? v : gid),
    get: async () => {
      if (name !== "projects") return { docs: [] }
      const docs =
        gid === undefined
          ? projectDocs()
          : projectDocs().filter((d) => (d.data().group_id ?? null) === gid)
      return { docs }
    },
  })

  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, undefined),
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
  }
})

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
    p1: { name: "UGC tháng 8", group_id: null, lifecycle: "running", sort_index: 100 },
    p2: { name: "UGC tháng 9", group_id: null, lifecycle: "running", sort_index: 200 },
    a1: { name: "Trong A #1", group_id: "gA", lifecycle: "running", sort_index: 100 },
    a2: { name: "Trong A #2", group_id: "gA", lifecycle: "running", sort_index: 300 },
    pDone: { name: "Đã hoàn thành", group_id: null, lifecycle: "archived", sort_index: 300 },
  }
  fx.groups = {
    gA: { name: "A", lifecycle: "active" },
    gB: { name: "B", lifecycle: "active" }, // empty
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
    expect(r).toMatchObject({ id: "p1", group_id: "gA" })
    const [patch] = projectUpdate.mock.calls[0]
    expect(patch.group_id).toBe("gA")
  })

  it("moves A→B by overwriting the single group_id field (A no longer contains it)", async () => {
    const r = await setProjectGroup(manager, "a1", { group_id: "gB" })
    expect(r).toMatchObject({ id: "a1", group_id: "gB" })
    // one scalar write; membership of A is derived from `where group_id == gA`,
    // which this project no longer matches
    const [patch] = projectUpdate.mock.calls[0]
    expect(patch.group_id).toBe("gB")
  })

  it("clears the group (group_id: null → Chưa phân nhóm)", async () => {
    const r = await setProjectGroup(manager, "a1", { group_id: null })
    expect(r).toMatchObject({ id: "a1", group_id: null })
    const [patch] = projectUpdate.mock.calls[0]
    expect(patch.group_id).toBeNull()
  })

  it("allows filing an archived project into a group (history still rolls up)", async () => {
    const r = await setProjectGroup(manager, "pDone", { group_id: "gA" })
    expect(r).toMatchObject({ id: "pDone", group_id: "gA" })
  })
})

describe("setProjectGroup — sort_index placement (task 3.2)", () => {
  it("drops the project at the END of the new bucket (max + step)", async () => {
    // gA has a1=100, a2=300 → next is 400
    const r = await setProjectGroup(manager, "p1", { group_id: "gA" })
    expect(r.sort_index).toBe(400)
    expect(projectUpdate).toHaveBeenCalledWith({ group_id: "gA", sort_index: 400 })
  })

  it("first project into an empty bucket gets the first step", async () => {
    const r = await setProjectGroup(manager, "a1", { group_id: "gB" })
    expect(r.sort_index).toBe(100)
  })

  it("moving to the ungrouped bucket places at its end", async () => {
    // ungrouped: p1=100, p2=200, pDone=300 → next is 400
    const r = await setProjectGroup(manager, "a1", { group_id: null })
    expect(r.sort_index).toBe(400)
  })

  it("re-assigning to the CURRENT group does not reposition", async () => {
    const r = await setProjectGroup(manager, "a1", { group_id: "gA" })
    expect(r.sort_index).toBeUndefined()
    expect(projectUpdate).toHaveBeenCalledWith({ group_id: "gA" })
  })
})
