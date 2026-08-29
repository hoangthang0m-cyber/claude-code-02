import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    memberships: [] as Array<{ project_id: string; project_role: string }>,
    items: [] as Array<Record<string, unknown> & { id: string }>,
    metrics: [] as Array<Record<string, unknown> & { id: string }>,
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
        const inClause = clauses.find((c) => c.startsWith("project_id:["))
        const scope = inClause
          ? (JSON.parse(inClause.slice("project_id:".length)) as string[])
          : []
        return {
          docs: fx.items
            .filter((i) => scope.includes(String(i.project_id)))
            .map((i) => ({ id: i.id, data: () => i })),
        }
      }
      if (name === "adsMetrics") {
        const inClause = clauses.find((c) => c.startsWith("content_item_id:["))
        const scope = inClause
          ? (JSON.parse(inClause.slice("content_item_id:".length)) as string[])
          : []
        return {
          docs: fx.metrics
            .filter((m) => scope.includes(String(m.content_item_id)))
            .map((m) => ({ id: m.id, data: () => m })),
        }
      }
      return { docs: [] }
    },
  })
  return {
    getAdminDb: () => ({ collection: (name: string) => query(name, []) }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { getProgressDashboard } from "@/modules/analytics/services/dashboard.server"

const NOW = Date.now()
const DAY = 86_400_000

const user = (uid: string): AuthedUser => ({
  uid,
  email: null,
  system_role: "staff",
})

beforeEach(() => {
  fx.memberships = []
  fx.items = []
  fx.metrics = []
})

describe("getProgressDashboard (SPEC §5.6 R1, task 8.1)", () => {
  it("no projects → empty dashboard", async () => {
    const r = await getProgressDashboard(user("u1"))
    expect(r).toMatchObject({
      mode: "staff",
      project_ids: [],
      total: 0,
      ads_running: 0,
    })
  })

  it("manager: counts every item across the projects they manage", async () => {
    fx.memberships = [
      { project_id: "p1", project_role: "manager" },
      { project_id: "p2", project_role: "manager" },
      { project_id: "p3", project_role: "staff" }, // not managed → out of scope
    ]
    fx.items = [
      { id: "a", project_id: "p1", status: "viet_kich_ban" },
      { id: "b", project_id: "p1", status: "cho_duyet_video", deadline: ts(NOW - DAY) },
      { id: "c", project_id: "p2", status: "da_len_ads" },
      { id: "d", project_id: "p3", status: "quay_dung" }, // ignored
    ]
    fx.metrics = [
      { id: "m1", content_item_id: "c", source: "synced", delivery_status: "active", captured_at: ts(NOW) },
    ]

    const r = await getProgressDashboard(user("mgr"))
    expect(r.mode).toBe("manager")
    expect(r.project_ids.sort()).toEqual(["p1", "p2"])
    expect(r).toMatchObject({
      total: 3,
      in_production: 1,
      pending_review: 1,
      published: 1,
      overdue: 1,
      ads_running: 1,
    })
  })

  it("staff: only the items assigned to them, across their member projects", async () => {
    fx.memberships = [
      { project_id: "p1", project_role: "staff" },
      { project_id: "p2", project_role: "staff" },
    ]
    fx.items = [
      { id: "a", project_id: "p1", status: "viet_kich_ban", assignee_id: "u1" },
      { id: "b", project_id: "p1", status: "quay_dung", assignee_id: "u2" }, // someone else
      { id: "c", project_id: "p2", status: "da_len_ads", assignee_id: "u1" },
    ]

    const r = await getProgressDashboard(user("u1"))
    expect(r.mode).toBe("staff")
    expect(r).toMatchObject({ total: 2, in_production: 1, published: 1 })
  })

  it("ads_running uses the current metric — latest synced, else latest manual", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "manager" }]
    fx.items = [
      { id: "a", project_id: "p1", status: "da_len_ads" },
      { id: "b", project_id: "p1", status: "da_len_ads" },
    ]
    fx.metrics = [
      // item a: newer synced says paused → not running
      { id: "m1", content_item_id: "a", source: "synced", delivery_status: "active", captured_at: ts(NOW - DAY) },
      { id: "m2", content_item_id: "a", source: "synced", delivery_status: "paused", captured_at: ts(NOW) },
      // item b: only a manual row, active → running
      { id: "m3", content_item_id: "b", source: "manual", delivery_status: "active", captured_at: ts(NOW) },
    ]

    const r = await getProgressDashboard(user("mgr"))
    expect(r.ads_running).toBe(1)
  })

  it("de-dupes when the caller is a member of a project twice", async () => {
    fx.memberships = [
      { project_id: "p1", project_role: "manager" },
      { project_id: "p1", project_role: "manager" },
    ]
    fx.items = [{ id: "a", project_id: "p1", status: "viet_kich_ban" }]
    const r = await getProgressDashboard(user("mgr"))
    expect(r.project_ids).toEqual(["p1"])
    expect(r.total).toBe(1)
  })
})
