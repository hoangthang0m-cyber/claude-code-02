import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx, batchSet, batchCommit } = vi.hoisted(() => ({
  fx: {
    projects: [] as Array<Record<string, unknown> & { id: string }>,
    groups: {} as Record<string, Record<string, unknown>>,
  },
  batchSet: vi.fn(),
  batchCommit: vi.fn(),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  let counter = 0
  const query = (name: string, gid: unknown) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, f === "group_id" ? v : gid),
    get: async () => {
      if (name !== "projects") return { docs: [] }
      const docs =
        gid === undefined
          ? fx.projects
          : fx.projects.filter((p) => (p.group_id ?? null) === gid)
      return { docs: docs.map((p) => ({ id: p.id, data: () => p })) }
    },
  })
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, undefined),
        doc: (id?: string) => {
          const docId = id ?? `${name}-${++counter}`
          return {
            id: docId,
            get: async () => ({
              exists: docId in fx.groups,
              data: () => fx.groups[docId],
            }),
          }
        },
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
  fx.projects = []
  fx.groups = {}
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

  // ── project-grouping task 3.3 ──────────────────────────────────────────────
  it("with no group_id → ungrouped, and sort_index at the end of that bucket", async () => {
    fx.projects = [
      { id: "u1", group_id: null, sort_index: 100 },
      { id: "u2", group_id: null, sort_index: 200 },
    ]
    await createProject(manager, { name: "P", objective: "o" })
    const [, projectData] = batchSet.mock.calls[0]
    expect("group_id" in projectData).toBe(false)
    expect(projectData.sort_index).toBe(300)
  })

  it("with a valid group_id → filed into the group, sort_index at its end", async () => {
    fx.groups = { gA: { name: "A", lifecycle: "active" } }
    fx.projects = [{ id: "a1", group_id: "gA", sort_index: 500 }]
    await createProject(manager, {
      name: "P",
      objective: "o",
      group_id: "gA",
    })
    const [, projectData] = batchSet.mock.calls[0]
    expect(projectData.group_id).toBe("gA")
    expect(projectData.sort_index).toBe(600)
  })

  it("404 when the chosen group does not exist", async () => {
    await expect(
      createProject(manager, { name: "P", objective: "o", group_id: "ghost" })
    ).rejects.toMatchObject({ status: 404 })
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("409 when the chosen group is archived", async () => {
    fx.groups = { gOld: { name: "Cũ", lifecycle: "archived" } }
    await expect(
      createProject(manager, { name: "P", objective: "o", group_id: "gOld" })
    ).rejects.toMatchObject({ status: 409 })
  })
})
