import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  fx,
  docSet,
  docUpdate,
  batchUpdate,
  batchDelete,
  batchCommit,
} = vi.hoisted(() => ({
  fx: {
    groups: {} as Record<string, Record<string, unknown>>,
    projects: [] as Array<{ id: string; group_id?: string | null }>,
  },
  docSet: vi.fn(),
  docUpdate: vi.fn(),
  batchUpdate: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  let counter = 0
  const query = (name: string, clauses: Array<[string, unknown]>) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, [...clauses, [f, v]]),
    get: async () => {
      if (name === "projects") {
        const gid = clauses.find(([f]) => f === "group_id")?.[1] ?? null
        const docs = fx.projects
          .filter((p) => (p.group_id ?? null) === gid)
          .map((p) => ({ id: p.id, ref: { __project: p.id }, data: () => p }))
        return { docs, size: docs.length }
      }
      return { docs: [], size: 0 }
    },
  })
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => {
          const docId = id ?? `${name}-${++counter}`
          return {
            id: docId,
            set: docSet,
            update: docUpdate,
            get: async () => ({
              exists: docId in fx.groups,
              data: () => fx.groups[docId],
            }),
          }
        },
      }),
      batch: () => ({
        update: batchUpdate,
        delete: batchDelete,
        commit: batchCommit,
      }),
    }),
    getAdminAuth: () => ({}),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  createProjectGroup,
  deleteProjectGroup,
  setProjectGroupLifecycle,
  updateProjectGroup,
} from "@/modules/project-grouping/services/projectGroups.server"

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
  fx.groups = {}
  fx.projects = []
  docSet.mockReset().mockResolvedValue(undefined)
  docUpdate.mockReset().mockResolvedValue(undefined)
  batchUpdate.mockReset()
  batchDelete.mockReset()
  batchCommit.mockReset().mockResolvedValue(undefined)
})

describe("createProjectGroup (project-grouping task 2.1)", () => {
  it("rejects a staff account with 403 and writes nothing", async () => {
    await expect(
      createProjectGroup(staff, { name: "UGC ROAS 2.0" })
    ).rejects.toMatchObject({ status: 403 })
    expect(docSet).not.toHaveBeenCalled()
  })

  it("rejects a missing name with 400 naming the field", async () => {
    await expect(createProjectGroup(manager, {})).rejects.toMatchObject({
      status: 400,
    })
    await expect(createProjectGroup(manager, {})).rejects.toThrow(/name/)
    expect(docSet).not.toHaveBeenCalled()
  })

  it("rejects a blank name with 400", async () => {
    await expect(
      createProjectGroup(manager, { name: "   " })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("creates the group: lifecycle active, created_by, created_at", async () => {
    const result = await createProjectGroup(manager, {
      name: "  UGC ROAS 2.0  ",
      description: "Các đợt UGC cùng định hướng",
    })

    expect(result.id).toMatch(/^projectGroups-/)
    expect(docSet).toHaveBeenCalledTimes(1)

    const [data] = docSet.mock.calls[0]
    expect(data).toMatchObject({
      name: "UGC ROAS 2.0", // trimmed
      description: "Các đợt UGC cùng định hướng",
      lifecycle: "active",
      created_by: "u-manager",
    })
    expect(data.created_at).toBeDefined()
  })

  it("does not persist an omitted description", async () => {
    await createProjectGroup(manager, { name: "Nhóm A" })
    const [data] = docSet.mock.calls[0]
    expect("description" in data).toBe(false)
  })
})

describe("updateProjectGroup (project-grouping task 2.2)", () => {
  beforeEach(() => {
    fx.groups = {
      g1: { name: "Tên cũ", description: "cũ", lifecycle: "active" },
      arch: { name: "Đã lưu", lifecycle: "archived" },
    }
  })

  it("rejects a staff account with 403", async () => {
    await expect(
      updateProjectGroup(staff, "g1", { name: "Tên mới" })
    ).rejects.toMatchObject({ status: 403 })
    expect(docUpdate).not.toHaveBeenCalled()
  })

  it("rejects an empty body with 400", async () => {
    await expect(updateProjectGroup(manager, "g1", {})).rejects.toMatchObject({
      status: 400,
    })
  })

  it("404 when the group does not exist", async () => {
    await expect(
      updateProjectGroup(manager, "nope", { name: "x" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("409 when the group is archived (read-only)", async () => {
    await expect(
      updateProjectGroup(manager, "arch", { name: "x" })
    ).rejects.toMatchObject({ status: 409 })
    expect(docUpdate).not.toHaveBeenCalled()
  })

  it("persists a name + description edit", async () => {
    const r = await updateProjectGroup(manager, "g1", {
      name: "  Tên mới  ",
      description: "mô tả mới",
    })
    expect(r).toEqual({ id: "g1" })
    expect(docUpdate).toHaveBeenCalledWith({
      name: "Tên mới",
      description: "mô tả mới",
    })
  })

  it("accepts a name-only edit and never writes lifecycle", async () => {
    await updateProjectGroup(manager, "g1", {
      name: "Chỉ tên",
      lifecycle: "archived",
    })
    const [patch] = docUpdate.mock.calls[0]
    expect(patch).toEqual({ name: "Chỉ tên" })
  })
})

describe("setProjectGroupLifecycle (project-grouping task 2.3)", () => {
  beforeEach(() => {
    fx.groups = {
      live: { name: "Đang chạy", lifecycle: "active" },
      old: { name: "Cũ", lifecycle: "archived" },
    }
  })

  it("rejects a staff account with 403", async () => {
    await expect(
      setProjectGroupLifecycle(staff, "live", { lifecycle: "archived" })
    ).rejects.toMatchObject({ status: 403 })
    expect(docUpdate).not.toHaveBeenCalled()
  })

  it("rejects a lifecycle outside active | archived with 400", async () => {
    await expect(
      setProjectGroupLifecycle(manager, "live", { lifecycle: "done" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("404 when the group does not exist", async () => {
    await expect(
      setProjectGroupLifecycle(manager, "nope", { lifecycle: "archived" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("400 when the group is already in that lifecycle", async () => {
    await expect(
      setProjectGroupLifecycle(manager, "live", { lifecycle: "active" })
    ).rejects.toMatchObject({ status: 400 })
    expect(docUpdate).not.toHaveBeenCalled()
  })

  it("archives: writes only { lifecycle } — the group's projects are untouched", async () => {
    const r = await setProjectGroupLifecycle(manager, "live", {
      lifecycle: "archived",
    })
    expect(r).toEqual({ id: "live", lifecycle: "archived" })
    expect(docUpdate).toHaveBeenCalledTimes(1)
    expect(docUpdate).toHaveBeenCalledWith({ lifecycle: "archived" })
  })

  it("restores an archived group", async () => {
    const r = await setProjectGroupLifecycle(manager, "old", {
      lifecycle: "active",
    })
    expect(r).toEqual({ id: "old", lifecycle: "active" })
    expect(docUpdate).toHaveBeenCalledWith({ lifecycle: "active" })
  })
})

describe("deleteProjectGroup (project-grouping task 2.4)", () => {
  beforeEach(() => {
    fx.groups = { g1: { name: "UGC", lifecycle: "active" } }
    fx.projects = [
      { id: "p1", group_id: "g1" },
      { id: "p2", group_id: "g1" },
      { id: "p3", group_id: "other" },
      { id: "p4", group_id: null },
    ]
  })

  it("rejects a staff account with 403", async () => {
    await expect(deleteProjectGroup(staff, "g1")).rejects.toMatchObject({
      status: 403,
    })
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("404 when the group does not exist", async () => {
    await expect(deleteProjectGroup(manager, "nope")).rejects.toMatchObject({
      status: 404,
    })
  })

  it("clears group_id on every project in the group and deletes the group", async () => {
    const r = await deleteProjectGroup(manager, "g1")

    expect(r).toEqual({ id: "g1", projects_reassigned: 2 })
    expect(batchCommit).toHaveBeenCalledTimes(1)

    // p1 + p2 set to null, nothing else
    expect(batchUpdate).toHaveBeenCalledTimes(2)
    const reassigned = batchUpdate.mock.calls.map(([ref, patch]) => [ref, patch])
    expect(reassigned).toEqual(
      expect.arrayContaining([
        [{ __project: "p1" }, { group_id: null }],
        [{ __project: "p2" }, { group_id: null }],
      ])
    )

    // exactly one delete — the group doc, never a project
    expect(batchDelete).toHaveBeenCalledTimes(1)
    expect(batchDelete.mock.calls[0][0].id).toBe("g1")
  })

  it("a group with no projects just deletes, count 0", async () => {
    fx.projects = [{ id: "p3", group_id: "other" }]
    const r = await deleteProjectGroup(manager, "g1")
    expect(r).toEqual({ id: "g1", projects_reassigned: 0 })
    expect(batchUpdate).not.toHaveBeenCalled()
    expect(batchDelete).toHaveBeenCalledTimes(1)
  })
})
