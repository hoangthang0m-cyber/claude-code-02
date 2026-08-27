import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    actorRole: "manager" as "manager" | "staff" | null,
    projectLifecycle: "running" as "running" | "done" | "archived" | null,
    targetUserExists: true,
    targetAlreadyMember: false,
    managerIds: ["m1", "m-other"] as string[],
    member: null as null | {
      id: string
      project_id: string
      user_id: string
      project_role: string
    },
    assignedItems: [] as Array<{ status: string }>,
    setSpy: vi.fn(),
    updateSpy: vi.fn(),
    deleteSpy: vi.fn(),
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  let idn = 0

  const query = (
    collection: string,
    clauses: Array<{ f: string; v: unknown }>
  ) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(collection, [...clauses, { f, v }]),
    limit: () => query(collection, clauses),
    get: async () => {
      if (collection === "projectMembers") {
        if (clauses.some((c) => c.f === "project_role")) {
          const docs = fx.managerIds.map((id) => ({ id }))
          return { empty: docs.length === 0, docs }
        }
        const userClause = clauses.find((c) => c.f === "user_id")
        if (userClause) {
          // The actor's scope lookup keys on the actor uid; the "already a
          // member?" check keys on the user being added.
          if (userClause.v === "u-actor") {
            const docs =
              fx.actorRole == null
                ? []
                : [
                    {
                      data: () => ({
                        project_role: fx.actorRole,
                        skill_tag: null,
                      }),
                    },
                  ]
            return { empty: docs.length === 0, docs }
          }
          const docs = fx.targetAlreadyMember ? [{ id: "existing" }] : []
          return { empty: docs.length === 0, docs }
        }
      }
      if (collection === "contentItems") {
        const docs = fx.assignedItems.map((it) => ({ data: () => it }))
        return { empty: docs.length === 0, docs, forEach: () => {} }
      }
      return { empty: true, docs: [] }
    },
  })

  const doc = (collection: string, id?: string) => ({
    id: id ?? `${collection}-${++idn}`,
    get: async () => {
      if (collection === "projects") {
        return {
          exists: fx.projectLifecycle != null,
          data: () => ({ lifecycle: fx.projectLifecycle }),
        }
      }
      if (collection === "projectMembers") {
        return {
          exists: fx.member != null,
          data: () => fx.member,
        }
      }
      return { exists: false, data: () => undefined }
    },
    set: fx.setSpy,
    update: fx.updateSpy,
    delete: fx.deleteSpy,
  })

  return {
    getAdminAuth: () => ({
      getUser: async (uid: string) => {
        if (!fx.targetUserExists) throw new Error("user not found")
        return { uid }
      },
    }),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => doc(name, id),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  addProjectMember,
  removeProjectMember,
  updateProjectMember,
} from "@/modules/project-workspace/services/members.server"

const actor: AuthedUser = { uid: "u-actor", email: null, system_role: "staff" }

beforeEach(() => {
  fx.actorRole = "manager"
  fx.projectLifecycle = "running"
  fx.targetUserExists = true
  fx.targetAlreadyMember = false
  fx.managerIds = ["m1", "m-other"]
  fx.member = {
    id: "m1",
    project_id: "p1",
    user_id: "u-target",
    project_role: "staff",
  }
  fx.assignedItems = []
  fx.setSpy.mockReset()
  fx.updateSpy.mockReset().mockResolvedValue(undefined)
  fx.deleteSpy.mockReset().mockResolvedValue(undefined)
})

describe("addProjectMember (SPEC §5.1 R4)", () => {
  it("rejects a non-manager with 403", async () => {
    fx.actorRole = "staff"
    await expect(
      addProjectMember(actor, "p1", { user_id: "u-target", project_role: "staff" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("rejects when the project is archived with 409", async () => {
    fx.projectLifecycle = "archived"
    await expect(
      addProjectMember(actor, "p1", { user_id: "u-target", project_role: "staff" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("rejects a user with no Firebase Auth account with 404", async () => {
    fx.targetUserExists = false
    await expect(
      addProjectMember(actor, "p1", { user_id: "u-ghost", project_role: "staff" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("rejects adding someone who is already a member with 409", async () => {
    fx.targetAlreadyMember = true
    await expect(
      addProjectMember(actor, "p1", { user_id: "u-target", project_role: "staff" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("adds a staff member with a content skill tag", async () => {
    const result = await addProjectMember(actor, "p1", {
      user_id: "u-target",
      project_role: "staff",
      skill_tag: "content",
    })
    expect(result.id).toBeDefined()
    const [doc] = fx.setSpy.mock.calls[0]
    expect(doc).toMatchObject({
      project_id: "p1",
      user_id: "u-target",
      project_role: "staff",
      skill_tag: "content",
    })
  })
})

describe("updateProjectMember (SPEC §5.1 R4)", () => {
  it("rejects an empty update with 400", async () => {
    await expect(
      updateProjectMember(actor, "p1", "m1", {})
    ).rejects.toMatchObject({ status: 400 })
  })

  it("404 when the member belongs to a different project", async () => {
    fx.member = {
      id: "m1",
      project_id: "OTHER",
      user_id: "u-target",
      project_role: "staff",
    }
    await expect(
      updateProjectMember(actor, "p1", "m1", { skill_tag: "ads" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("blocks demoting the last manager with 409", async () => {
    fx.member = {
      id: "m1",
      project_id: "p1",
      user_id: "u-target",
      project_role: "manager",
    }
    fx.managerIds = ["m1"]
    await expect(
      updateProjectMember(actor, "p1", "m1", { project_role: "staff" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("allows demoting a manager when another manager remains", async () => {
    fx.member = {
      id: "m1",
      project_id: "p1",
      user_id: "u-target",
      project_role: "manager",
    }
    fx.managerIds = ["m1", "m-other"]
    await updateProjectMember(actor, "p1", "m1", { project_role: "staff" })
    expect(fx.updateSpy).toHaveBeenCalledWith({ project_role: "staff" })
  })
})

describe("removeProjectMember (SPEC §5.1 R4)", () => {
  it("removes a member with no unfinished work", async () => {
    const result = await removeProjectMember(actor, "p1", "m1")
    expect(result).toEqual({ id: "m1", removed: true })
    expect(fx.deleteSpy).toHaveBeenCalledTimes(1)
  })

  it("blocks removal while the member is assignee of an unfinished item (409)", async () => {
    fx.assignedItems = [{ status: "quay_dung" }, { status: "da_len_ads" }]
    await expect(
      removeProjectMember(actor, "p1", "m1")
    ).rejects.toMatchObject({ status: 409 })
    expect(fx.deleteSpy).not.toHaveBeenCalled()
  })

  it("allows removal when all their assigned items are da_len_ads", async () => {
    fx.assignedItems = [{ status: "da_len_ads" }, { status: "da_len_ads" }]
    await removeProjectMember(actor, "p1", "m1")
    expect(fx.deleteSpy).toHaveBeenCalledTimes(1)
  })

  it("blocks removing the last manager with 409", async () => {
    fx.member = {
      id: "m1",
      project_id: "p1",
      user_id: "u-target",
      project_role: "manager",
    }
    fx.managerIds = ["m1"]
    await expect(
      removeProjectMember(actor, "p1", "m1")
    ).rejects.toMatchObject({ status: 409 })
  })
})
