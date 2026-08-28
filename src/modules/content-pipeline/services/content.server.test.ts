import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    actorRole: "staff" as "manager" | "staff" | null,
    projectLifecycle: "running" as "running" | "done" | "archived" | null,
    setSpy: vi.fn(),
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
          get: async () => ({
            exists: fx.projectLifecycle != null,
            data: () => ({ lifecycle: fx.projectLifecycle }),
          }),
          set: fx.setSpy,
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { createContentItem } from "@/modules/content-pipeline/services/content.server"

const actor: AuthedUser = { uid: "u1", email: null, system_role: "staff" }

beforeEach(() => {
  fx.actorRole = "staff"
  fx.projectLifecycle = "running"
  fx.setSpy.mockReset().mockResolvedValue(undefined)
})

describe("createContentItem (SPEC §5.2 R1)", () => {
  it("rejects a non-member with 403", async () => {
    fx.actorRole = null
    await expect(
      createContentItem(actor, "p1", { code: "V001" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("lets a staff member create one (SPEC §2: staff can create)", async () => {
    const result = await createContentItem(actor, "p1", { code: "V001" })
    expect(result).toEqual({ id: "contentItems-1", status: "chua_bat_dau" })
  })

  it("lets a manager create one", async () => {
    fx.actorRole = "manager"
    await expect(
      createContentItem(actor, "p1", { code: "V002" })
    ).resolves.toMatchObject({ status: "chua_bat_dau" })
  })

  it("rejects a missing / empty code with 400", async () => {
    await expect(createContentItem(actor, "p1", {})).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      createContentItem(actor, "p1", { code: "  " })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("returns 404 when the project does not exist", async () => {
    fx.projectLifecycle = null
    await expect(
      createContentItem(actor, "p1", { code: "V001" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("rejects creating in an archived project with 409", async () => {
    fx.projectLifecycle = "archived"
    await expect(
      createContentItem(actor, "p1", { code: "V001" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("persists project_id, code, status=chua_bat_dau and timestamps", async () => {
    await createContentItem(actor, "p1", { code: "V001" })
    const [doc] = fx.setSpy.mock.calls[0]
    expect(doc).toMatchObject({
      project_id: "p1",
      code: "V001",
      status: "chua_bat_dau",
    })
    expect(doc.created_at).toBeDefined()
    expect(doc.updated_at).toBeDefined()
    // unassigned, no deadline (SPEC §5.2 R1)
    expect("assignee_id" in doc).toBe(false)
    expect("deadline" in doc).toBe(false)
  })
})
