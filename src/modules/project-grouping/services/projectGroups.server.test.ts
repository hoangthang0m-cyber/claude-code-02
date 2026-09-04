import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx, docSet, docUpdate } = vi.hoisted(() => ({
  fx: { groups: {} as Record<string, Record<string, unknown>> },
  docSet: vi.fn(),
  docUpdate: vi.fn(),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  let counter = 0
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
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
    }),
    getAdminAuth: () => ({}),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  createProjectGroup,
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
  docSet.mockReset().mockResolvedValue(undefined)
  docUpdate.mockReset().mockResolvedValue(undefined)
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
