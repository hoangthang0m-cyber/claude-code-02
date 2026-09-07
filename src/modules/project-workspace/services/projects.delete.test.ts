import { beforeEach, describe, expect, it, vi } from "vitest"

// Hard delete a project + cascade (user-approved 2026-09-04, not in SPEC.md).

const { fx, batchDelete, batchCommit } = vi.hoisted(() => ({
  fx: {
    memberRole: "manager" as string | null, // null → not a member
    projectExists: true,
    projectName: "Chiến dịch UGC tháng 8",
    // docs per collection, keyed by collection name; each is [id, data]
    docs: {} as Record<string, Array<[string, Record<string, unknown>]>>,
  },
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
}))

const deletedPaths = () =>
  batchDelete.mock.calls.map(([ref]) => (ref as { path: string }).path)

vi.mock("@/lib/server/firebaseAdmin", () => {
  const docRef = (name: string, id: string) => ({
    id,
    path: `${name}/${id}`,
    get: async () => ({
      exists: name === "projects" ? fx.projectExists : true,
      data: () => (name === "projects" ? { name: fx.projectName } : {}),
    }),
    delete: () => undefined,
  })

  const collection = (name: string) => {
    const rows = () => {
      if (name === "projectMembers") {
        return fx.memberRole === null
          ? []
          : (fx.docs.projectMembers ?? []).map(
              ([id]) => [id, { project_role: fx.memberRole }] as [string, Record<string, unknown>]
            )
      }
      return fx.docs[name] ?? []
    }
    const q = () => ({
      where: () => q(),
      limit: () => q(),
      get: async () => {
        const docs = rows().map(([id, data]) => ({
          id,
          data: () => data,
          ref: docRef(name, id),
        }))
        return { empty: docs.length === 0, docs }
      },
    })
    return { ...q(), doc: (id: string) => docRef(name, id) }
  }

  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection,
      batch: () => ({ delete: batchDelete, commit: batchCommit }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { deleteProject } from "@/modules/project-workspace/services/projects.server"

const actor: AuthedUser = { uid: "u1", email: null, system_role: "staff" }

beforeEach(() => {
  fx.memberRole = "manager"
  fx.projectExists = true
  fx.projectName = "Chiến dịch UGC tháng 8"
  fx.docs = {
    contentItems: [
      ["c1", { project_id: "p1" }],
      ["c2", { project_id: "p1" }],
    ],
    projectMembers: [["p1__u1", {}], ["p1__u2", {}]],
    statusHistory: [["h1", {}], ["h2", {}], ["h3", {}]],
    comments: [["cm1", {}]],
    adsBindings: [["ab1", {}]],
    adsMetrics: [["am1", {}], ["am2", {}]],
    sheetSyncMappings: [["p1", {}]],
    syncRuns: [["sr1", {}]],
    syncConflicts: [["sc1", {}]],
    notifications: [["n1", {}]],
  }
  batchDelete.mockReset()
  batchCommit.mockReset().mockResolvedValue(undefined)
})

describe("deleteProject", () => {
  it("rejects a non-member with 403", async () => {
    fx.memberRole = null
    await expect(
      deleteProject(actor, "p1", { confirm_name: fx.projectName })
    ).rejects.toMatchObject({ status: 403 })
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("rejects a staff member with 403", async () => {
    fx.memberRole = "staff"
    await expect(
      deleteProject(actor, "p1", { confirm_name: fx.projectName })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("404 when the project does not exist", async () => {
    fx.projectExists = false
    await expect(
      deleteProject(actor, "p1", { confirm_name: fx.projectName })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("400 when confirm_name is missing or does not match the project name", async () => {
    await expect(deleteProject(actor, "p1", {})).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      deleteProject(actor, "p1", { confirm_name: "sai tên" })
    ).rejects.toMatchObject({ status: 400 })
    expect(batchCommit).not.toHaveBeenCalled()
  })

  it("deletes the project and cascades every child collection", async () => {
    const r = await deleteProject(actor, "p1", { confirm_name: fx.projectName })

    expect(r.content_items_deleted).toBe(2)
    const paths = deletedPaths()

    // project doc + 2 items + 2 members + 3 history + 1 comment + 1 binding +
    // 2 metrics + 1 mapping + 1 run + 1 conflict + 1 notification = 16
    expect(r.docs_deleted).toBe(16)
    expect(paths).toContain("projects/p1")
    expect(paths).toContain("contentItems/c1")
    expect(paths).toContain("projectMembers/p1__u2")
    expect(paths).toContain("statusHistory/h2")
    expect(paths).toContain("adsMetrics/am1")
    expect(paths).toContain("sheetSyncMappings/p1")

    // the project doc is deleted LAST (retryable on partial failure)
    expect(paths[paths.length - 1]).toBe("projects/p1")
  })

  it("a project with no content items still deletes cleanly", async () => {
    fx.docs.contentItems = []
    fx.docs.statusHistory = []
    fx.docs.comments = []
    fx.docs.adsBindings = []
    fx.docs.adsMetrics = []
    const r = await deleteProject(actor, "p1", { confirm_name: fx.projectName })
    expect(r.content_items_deleted).toBe(0)
    expect(deletedPaths()).toContain("projects/p1")
  })
})
