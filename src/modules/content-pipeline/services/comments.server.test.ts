import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    itemExists: true,
    itemAssignee: null as string | null,
    actorRole: "staff" as "manager" | "staff" | null,
    lifecycle: "running" as "running" | "done" | "archived" | null,
    memberUids: new Set<string>(["u-mgr", "u-staff", "u-viet"]),
    managerUids: ["u-mgr"] as string[],
    priorComments: [] as Array<{ mentions: string[] }>,
    setSpy: vi.fn(),
    commitSpy: vi.fn(),
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
      if (collection === "projectMembers" && clauses.includes("project_role")) {
        return { docs: fx.managerUids.map((u) => ({ data: () => ({ user_id: u }) })) }
      }
      if (collection === "comments") {
        const docs = fx.priorComments.map((c, i) => ({
          id: `pc${i}`,
          data: () => ({ ...c, created_at: { toMillis: () => i } }),
        }))
        return { docs, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) }
      }
      return { empty: true, docs: [], forEach: () => {} }
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
              const uid = id.split("__")[1]
              return { exists: fx.memberUids.has(uid) }
            }
            return {
              exists: fx.lifecycle != null,
              data: () => ({ lifecycle: fx.lifecycle }),
            }
          },
        }),
      }),
      batch: () => ({ set: fx.setSpy, commit: fx.commitSpy }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { createComment } from "@/modules/content-pipeline/services/comments.server"

const staff: AuthedUser = { uid: "u-staff", email: null, system_role: "staff" }
const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "staff" }

function notifications() {
  // batch.set calls: first is the comment, rest are notifications
  return fx.setSpy.mock.calls.slice(1).map((c) => c[1])
}

beforeEach(() => {
  fx.itemExists = true
  fx.itemAssignee = "u-staff"
  fx.actorRole = "staff"
  fx.lifecycle = "running"
  fx.memberUids = new Set(["u-mgr", "u-staff", "u-viet"])
  fx.managerUids = ["u-mgr"]
  fx.priorComments = []
  fx.setSpy.mockReset()
  fx.commitSpy.mockReset().mockResolvedValue(undefined)
})

describe("createComment (SPEC §5.2 R5 / §5.7 R1)", () => {
  it("404 when the item does not exist", async () => {
    fx.itemExists = false
    await expect(createComment(staff, "c1", { body: "hi" })).rejects.toMatchObject(
      { status: 404 }
    )
  })

  it("403 for a non-member", async () => {
    fx.actorRole = null
    await expect(createComment(staff, "c1", { body: "hi" })).rejects.toMatchObject(
      { status: 403 }
    )
  })

  it("403 for a staff member who is neither assignee nor previously mentioned", async () => {
    fx.itemAssignee = "someone-else"
    await expect(
      createComment(staff, "c1", { body: "hi" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("allows a staff member who was previously @mentioned", async () => {
    fx.itemAssignee = "someone-else"
    fx.priorComments = [{ mentions: ["u-staff"] }]
    await expect(createComment(staff, "c1", { body: "hi" })).resolves.toMatchObject(
      { id: expect.any(String) }
    )
  })

  it("409 when the project is archived", async () => {
    fx.lifecycle = "archived"
    await expect(createComment(mgr, "c1", { body: "hi" })).rejects.toMatchObject({
      status: 409,
    })
  })

  it("rejects a mention that is not a project member (SPEC §8 Q2)", async () => {
    fx.actorRole = "manager"
    await expect(
      createComment(mgr, "c1", { body: "hi", mentions: ["outsider"] })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("saves the comment with author, body and mentions", async () => {
    fx.actorRole = "manager"
    await createComment(mgr, "c1", { body: "check this", mentions: ["u-viet"] })
    const [, comment] = fx.setSpy.mock.calls[0]
    expect(comment).toMatchObject({
      content_item_id: "c1",
      author_id: "u-mgr",
      body: "check this",
      mentions: ["u-viet"],
    })
    expect(comment.created_at).toBeDefined()
  })

  it("notifies the mentioned member (comment_mention) — not the author", async () => {
    // author is the assignee here, so no comment_added to self
    await createComment(staff, "c1", { body: "@viet", mentions: ["u-viet", "u-staff"] })
    const n = notifications()
    expect(n).toContainEqual(
      expect.objectContaining({ recipient_id: "u-viet", type: "comment_mention" })
    )
    // author (u-staff) is not notified even though mentioned
    expect(n.every((x) => x.recipient_id !== "u-staff")).toBe(true)
  })

  it("notifies involved people (comment_added): assignee + managers, minus author & mentioned", async () => {
    fx.itemAssignee = "u-viet"
    fx.managerUids = ["u-mgr", "u-other-mgr"]
    // staff u-staff was mentioned before, so may comment
    fx.priorComments = [{ mentions: ["u-staff"] }]
    await createComment(staff, "c1", { body: "note", mentions: ["u-mgr"] })
    const n = notifications()
    // u-mgr got comment_mention (not comment_added)
    expect(n).toContainEqual(
      expect.objectContaining({ recipient_id: "u-mgr", type: "comment_mention" })
    )
    // u-viet (assignee) + u-other-mgr get comment_added
    expect(n).toContainEqual(
      expect.objectContaining({ recipient_id: "u-viet", type: "comment_added" })
    )
    expect(n).toContainEqual(
      expect.objectContaining({
        recipient_id: "u-other-mgr",
        type: "comment_added",
      })
    )
    // author not notified
    expect(n.every((x) => x.recipient_id !== "u-staff")).toBe(true)
  })
})
