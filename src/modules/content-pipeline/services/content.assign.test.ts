import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    itemExists: true,
    itemAssignee: null as string | null,
    actorRole: "manager" as "manager" | "staff" | null,
    projectLifecycle: "running" as "running" | "done" | "archived" | null,
    targetIsMember: true,
    batchUpdate: vi.fn(),
    batchSet: vi.fn(),
    batchCommit: vi.fn(),
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (collection: string, clauses: string[]) => ({
    where: (f: string) => query(collection, [...clauses, f]),
    limit: () => query(collection, clauses),
    get: async () => {
      if (collection === "projectMembers" && clauses.includes("user_id")) {
        return fx.actorRole == null
          ? { empty: true, docs: [] }
          : {
              empty: false,
              docs: [{ data: () => ({ project_role: fx.actorRole }) }],
            }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => ({
          id: id ?? `${name}-1`,
          get: async () => {
            if (name === "contentItems") {
              return {
                exists: fx.itemExists,
                data: () => ({
                  project_id: "p1",
                  code: "V001",
                  assignee_id: fx.itemAssignee,
                }),
              }
            }
            if (name === "projectMembers" && id?.includes("__")) {
              return { exists: fx.targetIsMember }
            }
            return {
              exists: fx.projectLifecycle != null,
              data: () => ({ lifecycle: fx.projectLifecycle }),
            }
          },
        }),
      }),
      batch: () => ({
        update: fx.batchUpdate,
        set: fx.batchSet,
        commit: fx.batchCommit,
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { assignContentItem } from "@/modules/content-pipeline/services/content.server"

const manager: AuthedUser = { uid: "u-mgr", email: null, system_role: "staff" }
const staff: AuthedUser = { uid: "u-staff", email: null, system_role: "staff" }

beforeEach(() => {
  fx.itemExists = true
  fx.itemAssignee = null
  fx.actorRole = "manager"
  fx.projectLifecycle = "running"
  fx.targetIsMember = true
  fx.batchUpdate.mockReset()
  fx.batchSet.mockReset()
  fx.batchCommit.mockReset().mockResolvedValue(undefined)
})

describe("assignContentItem (SPEC §5.2 R2)", () => {
  it("404 when the item does not exist", async () => {
    fx.itemExists = false
    await expect(
      assignContentItem(manager, "c1", { assignee_id: "u2" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("403 when the caller is not a project member", async () => {
    fx.actorRole = null
    await expect(
      assignContentItem(manager, "c1", { assignee_id: "u2" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("rejects assigning someone who is not a project member (SPEC §5.2 R2)", async () => {
    fx.targetIsMember = false
    await expect(
      assignContentItem(manager, "c1", { assignee_id: "u-outsider" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("manager assigns a member and notifies them", async () => {
    const result = await assignContentItem(manager, "c1", { assignee_id: "u2" })
    expect(result).toEqual({ id: "c1", assignee_id: "u2" })
    expect(fx.batchUpdate.mock.calls[0][1]).toMatchObject({
      assignee_id: "u2",
      updated_by: "u-mgr",
    })
    expect(fx.batchSet).toHaveBeenCalledTimes(1)
    expect(fx.batchSet.mock.calls[0][1]).toMatchObject({
      recipient_id: "u2",
      type: "content_assigned",
    })
  })

  it("manager can unassign (assignee_id: null), no notification", async () => {
    fx.itemAssignee = "u2"
    await assignContentItem(manager, "c1", { assignee_id: null })
    expect(fx.batchUpdate.mock.calls[0][1].assignee_id).toBeNull()
    expect(fx.batchSet).not.toHaveBeenCalled()
  })

  it("staff self-claims an unassigned item, no self-notification", async () => {
    fx.actorRole = "staff"
    fx.itemAssignee = null
    await assignContentItem(staff, "c1", { assignee_id: "u-staff" })
    expect(fx.batchUpdate.mock.calls[0][1].assignee_id).toBe("u-staff")
    expect(fx.batchSet).not.toHaveBeenCalled()
  })

  it("staff cannot assign to someone else (403)", async () => {
    fx.actorRole = "staff"
    await expect(
      assignContentItem(staff, "c1", { assignee_id: "u-other" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("staff cannot claim an item that already has an assignee (409)", async () => {
    fx.actorRole = "staff"
    fx.itemAssignee = "u-someone"
    await expect(
      assignContentItem(staff, "c1", { assignee_id: "u-staff" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("staff cannot unassign (403)", async () => {
    fx.actorRole = "staff"
    fx.itemAssignee = "u-staff"
    await expect(
      assignContentItem(staff, "c1", { assignee_id: null })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("409 when the project is archived", async () => {
    fx.projectLifecycle = "archived"
    await expect(
      assignContentItem(manager, "c1", { assignee_id: "u2" })
    ).rejects.toMatchObject({ status: 409 })
  })
})
