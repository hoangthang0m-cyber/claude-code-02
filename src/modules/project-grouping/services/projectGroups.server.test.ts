import { beforeEach, describe, expect, it, vi } from "vitest"

const { docSet } = vi.hoisted(() => ({ docSet: vi.fn() }))

vi.mock("@/lib/server/firebaseAdmin", () => {
  let counter = 0
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        doc: () => ({ id: `${name}-${++counter}`, set: docSet }),
      }),
    }),
    getAdminAuth: () => ({}),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { createProjectGroup } from "@/modules/project-grouping/services/projectGroups.server"

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
  docSet.mockReset().mockResolvedValue(undefined)
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
