import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    itemExists: true,
    projectId: "p1",
    actorRole: "staff" as "manager" | "staff" | null,
    projectLifecycle: "running" as "running" | "done" | "archived" | null,
    updateSpy: vi.fn(),
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
        doc: () => ({
          id: `${name}-1`,
          get: async () => {
            if (name === "contentItems") {
              return {
                exists: fx.itemExists,
                data: () => ({ project_id: fx.projectId, code: "V001" }),
              }
            }
            return {
              exists: fx.projectLifecycle != null,
              data: () => ({ lifecycle: fx.projectLifecycle }),
            }
          },
          update: fx.updateSpy,
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { updateContentItemFields } from "@/modules/content-pipeline/services/content.server"

const actor: AuthedUser = { uid: "u1", email: null, system_role: "staff" }

beforeEach(() => {
  fx.itemExists = true
  fx.projectId = "p1"
  fx.actorRole = "staff"
  fx.projectLifecycle = "running"
  fx.updateSpy.mockReset().mockResolvedValue(undefined)
})

describe("updateContentItemFields (SPEC §5.2 R1)", () => {
  it("404 when the content item does not exist", async () => {
    fx.itemExists = false
    await expect(
      updateContentItemFields(actor, "c1", { topic: "x" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("403 when the caller is not a member of the item's project", async () => {
    fx.actorRole = null
    await expect(
      updateContentItemFields(actor, "c1", { topic: "x" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("409 when the project is archived", async () => {
    fx.projectLifecycle = "archived"
    await expect(
      updateContentItemFields(actor, "c1", { topic: "x" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("400 on an empty patch", async () => {
    await expect(
      updateContentItemFields(actor, "c1", {})
    ).rejects.toMatchObject({ status: 400 })
  })

  it("400 on a bad script_url / content_format", async () => {
    await expect(
      updateContentItemFields(actor, "c1", { script_url: "not a url" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      updateContentItemFields(actor, "c1", { content_format: "tiktok" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("saves only the sent field + updated_at + updated_by (§5.2 R1)", async () => {
    await updateContentItemFields(actor, "c1", { topic: "Người thứ 3" })
    const [patch] = fx.updateSpy.mock.calls[0]
    expect(Object.keys(patch).sort()).toEqual([
      "topic",
      "updated_at",
      "updated_by",
    ])
    expect(patch.topic).toBe("Người thứ 3")
    expect(patch.updated_by).toBe("u1")
    expect(patch.updated_at).toBeDefined()
  })

  it("converts an ISO deadline to a Firestore Timestamp", async () => {
    await updateContentItemFields(actor, "c1", {
      deadline: "2026-09-01T00:00:00.000Z",
    })
    const [patch] = fx.updateSpy.mock.calls[0]
    expect(patch.deadline).toBeDefined()
    expect(typeof patch.deadline).toBe("object")
    expect(patch.deadline.constructor.name).toBe("Timestamp")
  })

  it("passes a null deadline through (clear)", async () => {
    await updateContentItemFields(actor, "c1", { deadline: null })
    const [patch] = fx.updateSpy.mock.calls[0]
    expect(patch.deadline).toBeNull()
  })

  it("lets a manager member edit too", async () => {
    fx.actorRole = "manager"
    await expect(
      updateContentItemFields(actor, "c1", { code: "V002" })
    ).resolves.toEqual({ id: "c1" })
  })
})
