import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    memberships: [] as Array<{ project_id: string; project_role: string }>,
    items: [] as Array<Record<string, unknown> & { id: string }>,
  },
}))

const ts = (ms: number) => ({ toMillis: () => ms })

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, [...clauses, `${f}:${JSON.stringify(v)}`]),
    get: async () => {
      if (name === "projectMembers") {
        return { docs: fx.memberships.map((m) => ({ data: () => m })) }
      }
      if (name === "contentItems") {
        const c = clauses.find((x) => x.startsWith("project_id:["))
        const scope = c ? (JSON.parse(c.slice("project_id:".length)) as string[]) : []
        return {
          docs: fx.items
            .filter((i) => scope.includes(String(i.project_id)))
            .map((i) => ({ id: i.id, data: () => i })),
        }
      }
      return { docs: [] }
    },
  })
  return { getAdminDb: () => ({ collection: (n: string) => query(n, []) }) }
})

import type { AuthedUser } from "@/lib/server/auth"
import { getPersonItems } from "@/modules/analytics/services/personItems.server"

const NOW = Date.now()
const DAY = 86_400_000
const user = (uid: string): AuthedUser => ({ uid, email: null, system_role: "staff" })

beforeEach(() => {
  fx.memberships = []
  fx.items = []
})

describe("getPersonItems (SPEC §5.6 R2, task 8.6)", () => {
  it("manager: a person's items across managed projects, overdue computed, sorted by deadline", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "manager" }]
    fx.items = [
      { id: "a", project_id: "p1", code: "A", status: "quay_dung", assignee_id: "u2", deadline: ts(NOW + 5 * DAY) },
      { id: "b", project_id: "p1", code: "B", status: "viet_kich_ban", assignee_id: "u2", deadline: ts(NOW - DAY) },
      { id: "c", project_id: "p1", code: "C", status: "da_len_ads", assignee_id: "other" },
    ]
    const { items } = await getPersonItems(user("mgr"), "u2")
    expect(items.map((i) => i.code)).toEqual(["B", "A"]) // B's deadline is sooner
    expect(items.find((i) => i.code === "B")?.is_overdue).toBe(true)
    expect(items.find((i) => i.code === "A")?.is_overdue).toBe(false)
  })

  it("filters by status when asked", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "manager" }]
    fx.items = [
      { id: "a", project_id: "p1", code: "A", status: "quay_dung", assignee_id: "u2" },
      { id: "b", project_id: "p1", code: "B", status: "da_duyet", assignee_id: "u2" },
    ]
    const { items } = await getPersonItems(user("mgr"), "u2", "da_duyet")
    expect(items.map((i) => i.code)).toEqual(["B"])
  })

  it("ignores an unknown status filter (shows all)", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "manager" }]
    fx.items = [{ id: "a", project_id: "p1", code: "A", status: "quay_dung", assignee_id: "u2" }]
    const { items } = await getPersonItems(user("mgr"), "u2", "bogus")
    expect(items).toHaveLength(1)
  })

  it("staff can only drill into themselves (403 otherwise)", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "staff" }]
    await expect(getPersonItems(user("u1"), "u2")).rejects.toMatchObject({ status: 403 })

    fx.items = [{ id: "a", project_id: "p1", code: "A", status: "quay_dung", assignee_id: "u1" }]
    const { items } = await getPersonItems(user("u1"), "u1")
    expect(items).toHaveLength(1)
  })

  it("no projects → empty", async () => {
    expect(await getPersonItems(user("x"), "x")).toEqual({ items: [] })
  })
})
