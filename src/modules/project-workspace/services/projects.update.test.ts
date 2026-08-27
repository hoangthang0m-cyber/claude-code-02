import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    memberDocs: [] as Array<Record<string, unknown>>,
    projectExists: true,
    projectData: {} as Record<string, unknown>,
    mappingRefs: [] as Array<{ id: string }>,
    batchUpdate: vi.fn(),
    batchDelete: vi.fn(),
    batchCommit: vi.fn(),
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const makeCollection = (name: string) => {
    const ref: Record<string, unknown> = {
      doc: (id: string) => ({
        id,
        get: async () => ({
          exists: fx.projectExists,
          data: () => fx.projectData,
        }),
      }),
      where: () => ref,
      limit: () => ref,
      get: async () => {
        if (name === "projectMembers") {
          const docs = fx.memberDocs.map((d) => ({ data: () => d }))
          return { empty: docs.length === 0, docs }
        }
        const docs = fx.mappingRefs.map((r) => ({ ref: r }))
        return { empty: docs.length === 0, docs, forEach: (f: (d: unknown) => void) => docs.forEach(f) }
      },
    }
    return ref
  }
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => makeCollection(name),
      batch: () => ({
        update: fx.batchUpdate,
        delete: fx.batchDelete,
        commit: fx.batchCommit,
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { updateProject } from "@/modules/project-workspace/services/projects.server"

const manager: AuthedUser = { uid: "u-mgr", email: null, system_role: "staff" }
// system_role is irrelevant here — project_role from membership is what matters.

beforeEach(() => {
  fx.memberDocs = [{ project_role: "manager", skill_tag: null }]
  fx.projectExists = true
  fx.projectData = { progress_sheet_url: "https://old.example/sheet" }
  fx.mappingRefs = []
  fx.batchUpdate.mockReset()
  fx.batchDelete.mockReset()
  fx.batchCommit.mockReset().mockResolvedValue(undefined)
})

describe("updateProject (SPEC §5.1 R2)", () => {
  it("rejects a non-member with 403", async () => {
    fx.memberDocs = []
    await expect(
      updateProject(manager, "p1", { retrospective: "x" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("rejects a staff member with 403", async () => {
    fx.memberDocs = [{ project_role: "staff", skill_tag: "content" }]
    await expect(
      updateProject(manager, "p1", { retrospective: "x" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("returns 404 when the project does not exist", async () => {
    fx.projectExists = false
    await expect(
      updateProject(manager, "p1", { name: "new" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("rejects an empty update with 400", async () => {
    await expect(updateProject(manager, "p1", {})).rejects.toMatchObject({
      status: 400,
    })
  })

  it("saves retrospective with updated_at + updated_by (SPEC §5.1 R2)", async () => {
    const result = await updateProject(manager, "p1", {
      retrospective: "Chốt: giữ 2 concept, dừng concept C",
    })
    expect(result).toEqual({ id: "p1", sheet_mapping_reset: false })
    expect(fx.batchCommit).toHaveBeenCalledTimes(1)

    const [, patch] = fx.batchUpdate.mock.calls[0]
    expect(patch.retrospective).toBe("Chốt: giữ 2 concept, dừng concept C")
    expect(patch.updated_by).toBe("u-mgr")
    expect(patch.updated_at).toBeDefined()
  })

  it("detaches the old sheet mapping when progress_sheet_url changes", async () => {
    fx.mappingRefs = [{ id: "m1" }, { id: "m2" }]
    const result = await updateProject(manager, "p1", {
      progress_sheet_url: "https://new.example/sheet",
    })
    expect(result.sheet_mapping_reset).toBe(true)
    expect(fx.batchDelete).toHaveBeenCalledTimes(2)
  })

  it("does not touch the mapping when progress_sheet_url is unchanged", async () => {
    fx.mappingRefs = [{ id: "m1" }]
    const result = await updateProject(manager, "p1", {
      progress_sheet_url: "https://old.example/sheet",
      name: "Đổi tên thôi",
    })
    expect(result.sheet_mapping_reset).toBe(false)
    expect(fx.batchDelete).not.toHaveBeenCalled()
  })
})
