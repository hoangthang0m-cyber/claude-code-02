import { beforeEach, describe, expect, it, vi } from "vitest"

const { batchSet, batchCommit } = vi.hoisted(() => ({
  batchSet: vi.fn(),
  batchCommit: vi.fn(),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  let counter = 0
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        doc: () => ({ id: `${name}-${++counter}` }),
      }),
      batch: () => ({ set: batchSet, commit: batchCommit }),
    }),
    getAdminAuth: () => ({}),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { createProject } from "@/modules/project-workspace/services/projects.server"

const manager: AuthedUser = {
  uid: "u-manager",
  email: "m@hemtarot.vn",
  system_role: "manager",
}
const staff: AuthedUser = { uid: "u-staff", email: "s@hemtarot.vn", system_role: "staff" }

beforeEach(() => {
  batchSet.mockReset()
  batchCommit.mockReset().mockResolvedValue(undefined)
})

describe("createProject (SPEC §5.1 R1)", () => {
  it("rejects a staff account with 403", async () => {
    await expect(
      createProject(staff, { name: "Q3", objective: "Tăng Mess" })
    ).rejects.toMatchObject({ status: 403 })
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("rejects a missing objective with 400 naming the field", async () => {
    await expect(createProject(manager, { name: "Q3" })).rejects.toMatchObject({
      status: 400,
    })
    await expect(createProject(manager, { name: "Q3" })).rejects.toThrow(
      /objective/
    )
  })

  it("rejects a missing name with 400", async () => {
    await expect(
      createProject(manager, { objective: "Tăng Mess" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects a blank name with 400", async () => {
    await expect(
      createProject(manager, { name: "   ", objective: "x" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("creates the project and the creator's manager membership", async () => {
    const result = await createProject(manager, {
      name: "Q3 Launch",
      objective: "Tăng Mess",
      progress_sheet_url: "not-a-valid-url-yet",
    })

    expect(result.id).toMatch(/^projects-/)
    expect(batchCommit).toHaveBeenCalledTimes(1)
    expect(batchSet).toHaveBeenCalledTimes(2)

    const [, projectData] = batchSet.mock.calls[0]
    expect(projectData).toMatchObject({
      name: "Q3 Launch",
      objective: "Tăng Mess",
      progress_sheet_url: "not-a-valid-url-yet",
      lifecycle: "running",
      created_by: "u-manager",
    })
    expect(projectData.created_at).toBeDefined()
    expect(projectData.updated_at).toBeDefined()

    const [, memberData] = batchSet.mock.calls[1]
    expect(memberData).toMatchObject({
      project_id: result.id,
      user_id: "u-manager",
      project_role: "manager",
      skill_tag: null,
    })
  })

  it("does not persist optional fields that were omitted", async () => {
    await createProject(manager, { name: "P", objective: "o" })
    const [, projectData] = batchSet.mock.calls[0]
    expect("description" in projectData).toBe(false)
    expect("progress_sheet_url" in projectData).toBe(false)
  })
})
