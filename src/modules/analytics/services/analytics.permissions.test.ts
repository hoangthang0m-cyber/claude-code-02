import { beforeEach, describe, expect, it, vi } from "vitest"

// Consolidated permission matrix for SPEC §5.6 R1 bullet 3 / §2 role table,
// task 8.7: the project-level dashboard + weekly/monthly report are for a
// project manager over the projects they manage; anyone else sees only the
// content items assigned to them, with no project/dept view.

const { fx } = vi.hoisted(() => ({
  fx: {
    memberships: [] as Array<{ project_id: string; project_role: string }>,
    members: [] as Array<{ project_id: string; user_id: string }>,
    items: [] as Array<Record<string, unknown> & { id: string }>,
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, [...clauses, `${f}:${JSON.stringify(v)}`]),
    get: async () => {
      const scopeOf = (field: string): string[] | null => {
        const c = clauses.find((x) => x.startsWith(`${field}:[`))
        return c ? (JSON.parse(c.slice(field.length + 1)) as string[]) : null
      }
      if (name === "projectMembers" && clauses.some((c) => c.startsWith("user_id:"))) {
        return { docs: fx.memberships.map((m) => ({ data: () => m })) }
      }
      if (name === "projectMembers") {
        const s = scopeOf("project_id") ?? []
        return {
          docs: fx.members
            .filter((m) => s.includes(m.project_id))
            .map((m) => ({ data: () => m })),
        }
      }
      if (name === "contentItems") {
        const s = scopeOf("project_id") ?? []
        return {
          docs: fx.items
            .filter((i) => s.includes(String(i.project_id)))
            .map((i) => ({ id: i.id, data: () => i })),
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
          get: async () => ({ data: () => ({ name: id }) }),
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { getProgressDashboard } from "@/modules/analytics/services/dashboard.server"
import { getPeoplePerformance } from "@/modules/analytics/services/people.server"
import { getPersonItems } from "@/modules/analytics/services/personItems.server"
import { getPeriodReport } from "@/modules/analytics/services/report.server"
import { resolveAnalyticsScope } from "@/modules/analytics/services/scope.server"

const NOW = Date.now()
const u = (uid: string): AuthedUser => ({ uid, email: null, system_role: "staff" })
const PERIOD = { from: NOW - 15 * 86_400_000, to: NOW + 15 * 86_400_000 }

beforeEach(() => {
  fx.memberships = []
  fx.members = []
  fx.items = []
})

describe("resolveAnalyticsScope", () => {
  it("manager on ≥1 project → manager mode over the managed projects only", async () => {
    fx.memberships = [
      { project_id: "p1", project_role: "manager" },
      { project_id: "p2", project_role: "staff" }, // merely staff here
    ]
    expect(await resolveAnalyticsScope(u("me"))).toEqual({
      mode: "manager",
      project_ids: ["p1"],
    })
  })

  it("no manager role → staff mode over every member project", async () => {
    fx.memberships = [
      { project_id: "p1", project_role: "staff" },
      { project_id: "p2", project_role: "staff" },
    ]
    const s = await resolveAnalyticsScope(u("me"))
    expect(s.mode).toBe("staff")
    expect(s.project_ids.sort()).toEqual(["p1", "p2"])
  })

  it("no projects → staff mode, empty scope", async () => {
    expect(await resolveAnalyticsScope(u("nobody"))).toEqual({
      mode: "staff",
      project_ids: [],
    })
  })
})

describe("dashboard + report: manager sees the project, staff sees only their work", () => {
  beforeEach(() => {
    fx.memberships = [
      { project_id: "p1", project_role: "manager" },
      { project_id: "p2", project_role: "staff" },
    ]
    fx.members = [
      { project_id: "p1", user_id: "me" },
      { project_id: "p1", user_id: "colleague" },
      { project_id: "p2", user_id: "me" },
    ]
    fx.items = [
      { id: "a", project_id: "p1", status: "quay_dung", assignee_id: "me" },
      { id: "b", project_id: "p1", status: "quay_dung", assignee_id: "colleague" },
      { id: "c", project_id: "p2", status: "quay_dung", assignee_id: "me" }, // staff-project
    ]
  })

  it("progress dashboard: manager counts the whole managed project, not the staff project", async () => {
    const d = await getProgressDashboard(u("me"))
    expect(d.mode).toBe("manager")
    expect(d.project_ids).toEqual(["p1"])
    expect(d.total).toBe(2) // a + b, NOT c
  })

  it("people table: manager sees every member of the managed project", async () => {
    const r = await getPeoplePerformance(u("me"), PERIOD)
    expect(r.people.map((p) => p.user_id).sort()).toEqual(["colleague", "me"])
  })

  it("period report: manager scope is the managed project", async () => {
    const r = await getPeriodReport(u("me"), "month", "2026-09-15")
    expect(r.mode).toBe("manager")
  })
})

describe("a pure-staff caller", () => {
  beforeEach(() => {
    fx.memberships = [{ project_id: "p1", project_role: "staff" }]
    fx.members = [
      { project_id: "p1", user_id: "me" },
      { project_id: "p1", user_id: "colleague" },
    ]
    fx.items = [
      { id: "a", project_id: "p1", status: "quay_dung", assignee_id: "me" },
      { id: "b", project_id: "p1", status: "da_len_ads", assignee_id: "me" },
      { id: "c", project_id: "p1", status: "quay_dung", assignee_id: "colleague" },
    ]
  })

  it("progress dashboard: only their own assigned items", async () => {
    const d = await getProgressDashboard(u("me"))
    expect(d.mode).toBe("staff")
    expect(d.total).toBe(2) // a + b, not the colleague's c
  })

  it("people table: only their own row", async () => {
    const r = await getPeoplePerformance(u("me"), PERIOD)
    expect(r.people.map((p) => p.user_id)).toEqual(["me"])
  })

  it("period report: computed over their own items only", async () => {
    const r = await getPeriodReport(u("me"), "month", "2026-09-15")
    expect(r.mode).toBe("staff")
  })

  it("drill-down: can open their own items, 403 on anyone else", async () => {
    const mine = await getPersonItems(u("me"), "me")
    expect(mine.items.map((i) => i.id).sort()).toEqual(["a", "b"])
    await expect(getPersonItems(u("me"), "colleague")).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe("a caller with no projects", () => {
  it("every analytics endpoint returns an empty, staff-scoped result", async () => {
    expect((await getProgressDashboard(u("x"))).total).toBe(0)
    expect((await getPeoplePerformance(u("x"), PERIOD)).people).toEqual([])
    expect((await getPeriodReport(u("x"), "week", "2026-09-15")).has_data).toBe(false)
    expect((await getPersonItems(u("x"), "x")).items).toEqual([])
  })
})
