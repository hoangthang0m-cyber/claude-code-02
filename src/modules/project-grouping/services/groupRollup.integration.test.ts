import { beforeEach, describe, expect, it, vi } from "vitest"

// project-grouping change tasks 6.2 / 6.3 — the group roll-up equals the manual
// aggregation of its child projects (and a project outside the viewer's rights
// is excluded), and the project-level analytics are unchanged after §1.4.

const { fx } = vi.hoisted(() => ({
  fx: {
    groups: {} as Record<string, Record<string, unknown>>,
    memberships: [] as Array<{ project_id: string; project_role: string }>,
    projects: [] as Array<Record<string, unknown> & { id: string }>,
    items: [] as Array<Record<string, unknown> & { id: string }>,
    history: [] as Array<Record<string, unknown>>,
    metrics: [] as Array<Record<string, unknown> & { id: string }>,
  },
}))

const ts = (ms: number) => ({ toMillis: () => ms })

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: Array<[string, unknown]>) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, [...clauses, [f, v]]),
    get: async () => {
      const val = (f: string) => clauses.find(([k]) => k === f)?.[1]
      const inVals = (f: string) => {
        const v = val(f)
        return Array.isArray(v) ? (v as string[]) : null
      }
      if (name === "projectMembers")
        return { docs: fx.memberships.map((m) => ({ data: () => m })) }
      if (name === "projects") {
        const gid = val("group_id")
        const docs =
          gid === undefined
            ? fx.projects
            : fx.projects.filter((p) => (p.group_id ?? null) === gid)
        return { docs: docs.map((p) => ({ id: p.id, data: () => p })) }
      }
      if (name === "contentItems") {
        const s = inVals("project_id") ?? []
        return {
          docs: fx.items
            .filter((i) => s.includes(String(i.project_id)))
            .map((i) => ({ id: i.id, data: () => i })),
        }
      }
      if (name === "statusHistory") {
        const s = inVals("content_item_id") ?? []
        return {
          docs: fx.history
            .filter((h) => s.includes(String(h.content_item_id)))
            .map((h, i) => ({ id: `h${i}`, data: () => h })),
        }
      }
      if (name === "adsMetrics") {
        const s = inVals("content_item_id") ?? []
        return {
          docs: fx.metrics
            .filter((m) => s.includes(String(m.content_item_id)))
            .map((m) => ({ id: m.id, data: () => m })),
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
          id,
          get: async () => {
            const store =
              name === "projectGroups"
                ? fx.groups
                : Object.fromEntries(fx.projects.map((p) => [p.id, p]))
            return { exists: id in store, data: () => store[id] }
          },
        }),
      }),
    }),
    getAdminAuth: () => ({}),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { getProgressDashboard } from "@/modules/analytics/services/dashboard.server"
import { periodReportForScope } from "@/modules/analytics/services/report.server"
import {
  getGroupDashboard,
  getGroupPeriodReport,
} from "@/modules/project-grouping/services/groupRollup.server"

const mgr: AuthedUser = { uid: "mgr", email: null, system_role: "manager" }
const SEP = Date.UTC(2026, 8, 1) - 7 * 3600 * 1000
const D = 86_400_000

const metric = (
  id: string,
  cid: string,
  spend: number,
  messages: number,
  roas: number
) => ({
  id,
  content_item_id: cid,
  source: "synced",
  spend,
  messages,
  roas,
  ctr: 0,
  cost_per_purchase: 0,
  delivery_status: "active",
  captured_at: ts(9e12),
  data_as_of: ts(0),
})
const published = (cid: string, ms: number) => ({
  content_item_id: cid,
  from_status: "da_duyet",
  to_status: "da_len_ads",
  created_at: ts(ms),
})

beforeEach(() => {
  fx.groups = { g: { name: "UGC ROAS 2.0", lifecycle: "active" } }
  fx.memberships = [
    { project_id: "p1", project_role: "manager" },
    { project_id: "p2", project_role: "manager" },
    { project_id: "p3", project_role: "manager" },
    // p4 is in the group but the viewer is only staff there
    { project_id: "p4", project_role: "staff" },
  ]
  fx.projects = [
    { id: "p1", name: "P1", group_id: "g" },
    { id: "p2", name: "P2", group_id: "g" },
    { id: "p3", name: "P3", group_id: "g" },
    { id: "p4", name: "P4", group_id: "g" },
  ]
  fx.items = [
    { id: "a1", project_id: "p1", code: "A1", deadline: ts(SEP + 20 * D) },
    { id: "a2", project_id: "p2", code: "A2", deadline: ts(SEP + 2 * D) }, // late
    { id: "a3", project_id: "p3", code: "A3", deadline: ts(SEP + 20 * D) },
    { id: "a4", project_id: "p4", code: "A4", deadline: ts(SEP + 20 * D) }, // out of scope
    { id: "x1", project_id: "p1", status: "quay_dung" },
  ]
  fx.history = [
    published("a1", SEP + 5 * D),
    published("a2", SEP + 6 * D),
    published("a3", SEP + 7 * D),
    published("a4", SEP + 8 * D),
  ]
  fx.metrics = [
    metric("m1", "a1", 100, 4, 3),
    metric("m2", "a2", 300, 6, 5),
    metric("m3", "a3", 200, 2, 4),
    metric("m4", "a4", 999, 99, 9), // out of scope — must not leak in
  ]
})

describe("group roll-up == manual sum of child projects (task 6.3)", () => {
  it("throughput / spend / messages / weighted ROAS add up over the managed children only", async () => {
    const group = await getGroupPeriodReport(mgr, "g", "month", "2026-09-15")

    const parts = await Promise.all(
      ["p1", "p2", "p3"].map((id) =>
        periodReportForScope(
          { mode: "manager", project_ids: [id], uid: "mgr" },
          "month",
          "2026-09-15"
        )
      )
    )

    const sum = (f: (r: (typeof parts)[number]) => number) =>
      parts.reduce((t, r) => t + f(r), 0)

    expect(group.projects_counted).toBe(3)
    expect(group.projects_total).toBe(4)
    expect(group.throughput).toBe(sum((r) => r.throughput))
    expect(group.total_spend).toBe(sum((r) => r.total_spend))
    expect(group.total_messages).toBe(sum((r) => r.total_messages))

    // weighted ROAS = Σ(spend·roas) / Σ(spend) over the cohort
    const wr =
      (3 * 100 + 5 * 300 + 4 * 200) / (100 + 300 + 200)
    expect(group.weighted_roas).toBeCloseTo(wr, 6)

    // the out-of-scope project p4 never contributes
    expect(group.total_spend).toBe(600) // not 600 + 999
  })
})

describe("project-level analytics unchanged after §1.4 (task 6.2)", () => {
  it("a group holding exactly the viewer's projects gives the same dashboard as the actor-level one", async () => {
    const actor = await getProgressDashboard(mgr)
    const group = await getGroupDashboard(mgr, "g")

    // actor scope = p1..p3 (managed); group scope = p1..p3 (p4 excluded) → equal
    expect(group.total).toBe(actor.total)
    expect(group.in_production).toBe(actor.in_production)
    expect(group.pending_review).toBe(actor.pending_review)
    expect(group.published).toBe(actor.published)
    expect(group.project_ids.sort()).toEqual(actor.project_ids.sort())
  })
})
