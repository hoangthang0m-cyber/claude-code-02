import { beforeEach, describe, expect, it, vi } from "vitest"

// project-grouping change task 1.4 — the aggregation cores take an explicit
// project-id SET (a ScopedView), not an AuthedUser. This test drives the cores
// directly with a hand-built set — the case a group roll-up (task 5.x) needs,
// where the projects come from `group_id`, not from the caller's memberships.
// The actor-level wrappers are still covered by dashboard.server.test.ts /
// report.server.test.ts (unchanged), which is the "chỉ số cấp dự án không đổi"
// regression.

const { fx } = vi.hoisted(() => ({
  fx: {
    items: [] as Array<Record<string, unknown> & { id: string }>,
    history: [] as Array<Record<string, unknown>>,
    metrics: [] as Array<Record<string, unknown> & { id: string }>,
  },
}))

const ts = (ms: number) => ({ toMillis: () => ms })

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, [...clauses, `${f}:${JSON.stringify(v)}`]),
    get: async () => {
      const scopeOf = (field: string): string[] =>
        JSON.parse(
          (clauses.find((c) => c.startsWith(`${field}:[`)) ?? `${field}:[]`).slice(
            field.length + 1
          )
        )
      if (name === "contentItems") {
        const s = scopeOf("project_id")
        return {
          docs: fx.items
            .filter((i) => s.includes(String(i.project_id)))
            .map((i) => ({ id: i.id, data: () => i })),
        }
      }
      if (name === "statusHistory") {
        const s = scopeOf("content_item_id")
        return {
          docs: fx.history
            .filter((h) => s.includes(String(h.content_item_id)))
            .map((h, i) => ({ id: `h${i}`, data: () => h })),
        }
      }
      if (name === "adsMetrics") {
        const s = scopeOf("content_item_id")
        return {
          docs: fx.metrics
            .filter((m) => s.includes(String(m.content_item_id)))
            .map((m) => ({ id: m.id, data: () => m })),
        }
      }
      return { docs: [] }
    },
  })
  return { getAdminDb: () => ({ collection: (n: string) => query(n, []) }) }
})

import { progressDashboardForScope } from "@/modules/analytics/services/dashboard.server"
import { periodReportForScope } from "@/modules/analytics/services/report.server"
import { scopedView } from "@/modules/analytics/services/scope.server"

const SEP_START = Date.UTC(2026, 8, 1) - 7 * 3600 * 1000
const DAY = 86_400_000

beforeEach(() => {
  fx.items = []
  fx.history = []
  fx.metrics = []
})

describe("progressDashboardForScope (task 1.4)", () => {
  it("counts over exactly the passed project-id set — membership is irrelevant", async () => {
    fx.items = [
      { id: "a", project_id: "pA", status: "viet_kich_ban" },
      { id: "b", project_id: "pB", status: "cho_duyet_video", deadline: ts(Date.now() - DAY) },
      { id: "c", project_id: "pC", status: "da_len_ads" }, // NOT in the set
    ]

    const r = await progressDashboardForScope({
      mode: "manager",
      project_ids: ["pA", "pB"],
      uid: "viewer-who-is-not-a-member",
    })

    expect(r.project_ids.sort()).toEqual(["pA", "pB"])
    expect(r).toMatchObject({ total: 2, in_production: 1, pending_review: 1, overdue: 1 })
  })

  it("empty set → empty dashboard, keeps the passed mode", async () => {
    const r = await progressDashboardForScope({
      mode: "manager",
      project_ids: [],
      uid: "x",
    })
    expect(r).toMatchObject({ mode: "manager", project_ids: [], total: 0 })
  })

  it("a one-element set behaves like a single-project dashboard", async () => {
    fx.items = [
      { id: "a", project_id: "solo", status: "quay_dung" },
      { id: "b", project_id: "solo", status: "da_len_ads" },
      { id: "z", project_id: "other", status: "quay_dung" },
    ]
    const r = await progressDashboardForScope(
      scopedView({ mode: "manager", project_ids: ["solo"] }, "x")
    )
    expect(r.total).toBe(2)
  })
})

describe("periodReportForScope (task 1.4)", () => {
  it("aggregates the §5.6 R3 report over the passed set", async () => {
    fx.items = [
      { id: "a", project_id: "pA", code: "A", deadline: ts(SEP_START + 20 * DAY) },
      { id: "b", project_id: "pB", code: "B", deadline: ts(SEP_START + 20 * DAY) },
    ]
    fx.history = [
      { content_item_id: "a", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP_START + 3 * DAY) },
      { content_item_id: "b", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP_START + 4 * DAY) },
    ]
    fx.metrics = [
      { id: "m-a", content_item_id: "a", source: "synced", spend: 100, messages: 2, roas: 3, ctr: 0, cost_per_purchase: 0, delivery_status: "active", captured_at: ts(9e12), data_as_of: ts(0) },
      { id: "m-b", content_item_id: "b", source: "synced", spend: 300, messages: 6, roas: 5, ctr: 0, cost_per_purchase: 0, delivery_status: "active", captured_at: ts(9e12), data_as_of: ts(0) },
    ]

    const r = await periodReportForScope(
      { mode: "manager", project_ids: ["pA", "pB"], uid: "x" },
      "month",
      "2026-09-15"
    )

    expect(r.has_data).toBe(true)
    expect(r.throughput).toBe(2)
    expect(r.total_spend).toBe(400)
    expect(r.weighted_roas).toBe((3 * 100 + 5 * 300) / 400)
  })

  it("still validates the period (400 on a bad kind)", async () => {
    await expect(
      periodReportForScope({ mode: "manager", project_ids: ["pA"], uid: "x" }, "quarter", "2026-09-01")
    ).rejects.toMatchObject({ status: 400 })
  })
})
