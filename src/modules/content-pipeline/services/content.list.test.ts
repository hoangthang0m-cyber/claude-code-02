import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    actorRole: "staff" as "manager" | "staff" | null,
    docs: [] as Array<Record<string, unknown>>,
  },
}))

const ts = (ms: number) => ({ toMillis: () => ms })

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
      if (collection === "contentItems") {
        return { docs: fx.docs.map((d, i) => ({ id: `c${i}`, data: () => d })) }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({ collection: (n: string) => query(n, []) }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { listContentItems } from "@/modules/content-pipeline/services/content.server"

const actor: AuthedUser = { uid: "u1", email: null, system_role: "staff" }
const now = Date.now()

beforeEach(() => {
  fx.actorRole = "staff"
  fx.docs = [
    // c0: overdue (past deadline, not done), assigned to u-thang, topic "NYC"
    {
      project_id: "p1",
      code: "V0",
      status: "quay_dung",
      assignee_id: "u-thang",
      topic: "NYC",
      deadline: ts(now - 100000),
      updated_at: ts(now - 5000),
    },
    // c1: past deadline but da_len_ads → NOT overdue
    {
      project_id: "p1",
      code: "V1",
      status: "da_len_ads",
      assignee_id: "u-thang",
      topic: "NYC",
      deadline: ts(now - 200000),
      updated_at: ts(now - 1000),
    },
    // c2: future deadline, unassigned, topic "Người thứ 3", status cho_duyet_video
    {
      project_id: "p1",
      code: "V2",
      status: "cho_duyet_video",
      topic: "Người thứ 3",
      deadline: ts(now + 100000),
      updated_at: ts(now - 9000),
    },
    // c3: no deadline, assigned to u-viet, status cho_duyet_video
    {
      project_id: "p1",
      code: "V3",
      status: "cho_duyet_video",
      assignee_id: "u-viet",
      topic: "NYC",
      updated_at: ts(now - 2000),
    },
  ]
})

describe("listContentItems (SPEC §5.2 R4)", () => {
  it("rejects a non-member with 403", async () => {
    fx.actorRole = null
    await expect(listContentItems(actor, "p1", {})).rejects.toMatchObject({
      status: 403,
    })
  })

  it("computes is_overdue per item (§6.7)", async () => {
    const { items } = await listContentItems(actor, "p1", {})
    const byCode = Object.fromEntries(items.map((i) => [i.code, i.is_overdue]))
    expect(byCode).toEqual({ V0: true, V1: false, V2: false, V3: false })
  })

  it("filters by assignee, and by 'none' for unassigned", async () => {
    expect(
      (await listContentItems(actor, "p1", { assignee: "u-thang" })).items.map(
        (i) => i.code
      )
    ).toEqual(expect.arrayContaining(["V0", "V1"]))
    expect(
      (await listContentItems(actor, "p1", { assignee: "none" })).items.map(
        (i) => i.code
      )
    ).toEqual(["V2"])
  })

  it("filters by status", async () => {
    const { items } = await listContentItems(actor, "p1", {
      status: "cho_duyet_video",
    })
    expect(items.map((i) => i.code).sort()).toEqual(["V2", "V3"])
  })

  it("filters by topic (exact)", async () => {
    const { items } = await listContentItems(actor, "p1", { topic: "NYC" })
    expect(items.map((i) => i.code).sort()).toEqual(["V0", "V1", "V3"])
  })

  it("filters overdue = only past-deadline & not da_len_ads (§5.2 R4)", async () => {
    const { items } = await listContentItems(actor, "p1", { overdue: "true" })
    expect(items.map((i) => i.code)).toEqual(["V0"])
  })

  it("combines filters — assignee + status (§5.2 R4 scenario)", async () => {
    const { items } = await listContentItems(actor, "p1", {
      assignee: "u-viet",
      status: "cho_duyet_video",
    })
    expect(items.map((i) => i.code)).toEqual(["V3"])
  })

  it("is_overdue recomputes when the deadline moves (§5.3 R6, task 4.8)", async () => {
    const overdueItem = fx.docs[0] as { deadline: unknown }
    expect(
      (await listContentItems(actor, "p1", {})).items.find((i) => i.code === "V0")
        ?.is_overdue
    ).toBe(true)

    // push the deadline a week out — nothing else changes
    overdueItem.deadline = ts(now + 7 * 86_400_000)
    expect(
      (await listContentItems(actor, "p1", {})).items.find((i) => i.code === "V0")
        ?.is_overdue
    ).toBe(false)
    expect(
      (await listContentItems(actor, "p1", { overdue: "true" })).items.map(
        (i) => i.code
      )
    ).toEqual([])
  })

  it("sorts by deadline ascending, no-deadline last", async () => {
    const { items } = await listContentItems(actor, "p1", { sort: "deadline" })
    expect(items.map((i) => i.code)).toEqual(["V1", "V0", "V2", "V3"])
  })

  it("sorts by updated_at descending (default)", async () => {
    const { items } = await listContentItems(actor, "p1", {})
    expect(items.map((i) => i.code)).toEqual(["V1", "V3", "V0", "V2"])
  })
})
