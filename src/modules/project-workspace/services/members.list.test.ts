import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    actorRole: "staff" as "manager" | "staff" | null,
    memberDocs: [] as Array<Record<string, unknown>>,
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (collection: string, clauses: Array<{ f: string }>) => ({
    where: (f: string) => query(collection, [...clauses, { f }]),
    limit: () => query(collection, clauses),
    get: async () => {
      if (collection === "projectMembers" && clauses.some((c) => c.f === "user_id")) {
        return fx.actorRole == null
          ? { empty: true, docs: [] }
          : {
              empty: false,
              docs: [{ data: () => ({ project_role: fx.actorRole }) }],
            }
      }
      // list-members query (project_id only)
      return {
        empty: fx.memberDocs.length === 0,
        docs: fx.memberDocs.map((d, i) => ({ id: `m${i}`, data: () => d })),
      }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({ collection: (n: string) => query(n, []) }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { listProjectMembers } from "@/modules/project-workspace/services/members.server"

const actor: AuthedUser = { uid: "u1", email: null, system_role: "staff" }

beforeEach(() => {
  fx.actorRole = "staff"
  fx.memberDocs = [
    { project_id: "p1", user_id: "u1", project_role: "manager", skill_tag: null },
    { project_id: "p1", user_id: "u2", project_role: "staff", skill_tag: "content" },
  ]
})

describe("listProjectMembers (SPEC §5.1 R4)", () => {
  it("rejects a non-member with 403", async () => {
    fx.actorRole = null
    await expect(listProjectMembers(actor, "p1")).rejects.toMatchObject({
      status: 403,
    })
  })

  it("returns the member list for any project member (incl. staff)", async () => {
    const { members } = await listProjectMembers(actor, "p1")
    expect(members).toHaveLength(2)
    expect(members[0]).toMatchObject({ id: "m0", user_id: "u1", project_role: "manager" })
  })
})
