import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    memberships: [] as Array<{ project_id: string; project_role: string }>,
    members: [] as Array<{ project_id: string; user_id: string }>,
    items: [] as Array<Record<string, unknown> & { id: string }>,
    history: [] as Array<Record<string, unknown>>,
    names: {} as Record<string, string>,
  },
}))

const ts = (ms: number) => ({ toMillis: () => ms })

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, [...clauses, `${f}:${JSON.stringify(v)}`]),
    get: async () => {
      const inScope = (field: string): string[] | null => {
        const c = clauses.find((x) => x.startsWith(`${field}:[`))
        return c ? (JSON.parse(c.slice(field.length + 1)) as string[]) : null
      }
      if (name === "projectMembers" && clauses.some((c) => c.startsWith("user_id:"))) {
        return { docs: fx.memberships.map((m) => ({ data: () => m })) }
      }
      if (name === "projectMembers") {
        const scope = inScope("project_id") ?? []
        return {
          docs: fx.members
            .filter((m) => scope.includes(m.project_id))
            .map((m) => ({ data: () => m })),
        }
      }
      if (name === "contentItems") {
        const scope = inScope("project_id") ?? []
        return {
          docs: fx.items
            .filter((i) => scope.includes(String(i.project_id)))
            .map((i) => ({ id: i.id, data: () => i })),
        }
      }
      if (name === "statusHistory") {
        const scope = inScope("content_item_id") ?? []
        return {
          docs: fx.history
            .filter((h) => scope.includes(String(h.content_item_id)))
            .map((h, idx) => ({ id: `h${idx}`, data: () => h })),
        }
      }
      return { docs: [] }
    },
  })
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id: string) => ({
          get: async () => ({ data: () => ({ name: fx.names[id] }) }),
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { getPeoplePerformance } from "@/modules/analytics/services/people.server"

const NOW = Date.now()
const DAY = 86_400_000
const PERIOD = { from: NOW - 15 * DAY, to: NOW + 15 * DAY }

const user = (uid: string): AuthedUser => ({ uid, email: null, system_role: "staff" })

beforeEach(() => {
  fx.memberships = []
  fx.members = []
  fx.items = []
  fx.history = []
  fx.names = {}
})

describe("getPeoplePerformance (SPEC §5.6 R2, task 8.2)", () => {
  it("manager: one row per member of the managed projects, sorted by name", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "manager" }]
    fx.members = [
      { project_id: "p1", user_id: "u-an" },
      { project_id: "p1", user_id: "u-bình" },
    ]
    fx.names = { "u-an": "An", "u-bình": "Bình" }
    fx.items = [
      { id: "a", project_id: "p1", status: "quay_dung", assignee_id: "u-an" },
      { id: "b", project_id: "p1", status: "da_duyet", assignee_id: "u-an" },
      { id: "c", project_id: "p1", status: "viet_kich_ban", assignee_id: "u-bình", deadline: ts(NOW - DAY) },
    ]
    fx.history = [
      { content_item_id: "b", to_status: "viet_kich_ban", created_at: ts(PERIOD.from + DAY) },
      { content_item_id: "b", to_status: "da_duyet", created_at: ts(PERIOD.from + 4 * DAY) },
    ]

    const r = await getPeoplePerformance(user("mgr"), PERIOD)
    expect(r.mode).toBe("manager")
    expect(r.people.map((p) => p.name)).toEqual(["An", "Bình"])

    const an = r.people[0]
    expect(an).toMatchObject({
      in_progress: 1, // "b" is da_duyet → excluded
      completed_in_period: 1,
      avg_lead_time_ms: 3 * DAY,
      overdue: 0,
      has_overdue: false,
    })
    const binh = r.people[1]
    expect(binh).toMatchObject({ in_progress: 1, overdue: 1, has_overdue: true })
  })

  it("staff: only their own row, only their assigned items", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "staff" }]
    fx.members = [
      { project_id: "p1", user_id: "u1" },
      { project_id: "p1", user_id: "u2" },
    ]
    fx.names = { u1: "Một", u2: "Hai" }
    fx.items = [
      { id: "a", project_id: "p1", status: "quay_dung", assignee_id: "u1" },
      { id: "b", project_id: "p1", status: "quay_dung", assignee_id: "u2" },
    ]

    const r = await getPeoplePerformance(user("u1"), PERIOD)
    expect(r.mode).toBe("staff")
    expect(r.people.map((p) => p.user_id)).toEqual(["u1"])
    expect(r.people[0].in_progress).toBe(1)
  })

  it("no projects → empty people list, period still returned", async () => {
    const r = await getPeoplePerformance(user("nobody"), PERIOD)
    expect(r).toEqual({ mode: "staff", period: PERIOD, people: [] })
  })

  it("a member with no assigned items shows all zeros", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "manager" }]
    fx.members = [{ project_id: "p1", user_id: "idle" }]
    fx.names = { idle: "Rảnh" }
    const r = await getPeoplePerformance(user("mgr"), PERIOD)
    expect(r.people[0]).toMatchObject({
      user_id: "idle",
      in_progress: 0,
      completed_in_period: 0,
      overdue: 0,
      avg_lead_time_ms: null,
    })
  })

  it("defaults the period to the current UTC month when none is given", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "manager" }]
    const r = await getPeoplePerformance(user("mgr"))
    const d = new Date()
    expect(r.period.from).toBe(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    expect(r.period.to).toBe(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  })
})
