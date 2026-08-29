import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    memberships: [] as Array<{ project_id: string; project_role: string }>,
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
      const inScope = (field: string): string[] | null => {
        const c = clauses.find((x) => x.startsWith(`${field}:[`))
        return c ? (JSON.parse(c.slice(field.length + 1)) as string[]) : null
      }
      if (name === "projectMembers") {
        return { docs: fx.memberships.map((m) => ({ data: () => m })) }
      }
      if (name === "contentItems") {
        const s = inScope("project_id") ?? []
        return {
          docs: fx.items
            .filter((i) => s.includes(String(i.project_id)))
            .map((i) => ({ id: i.id, data: () => i })),
        }
      }
      if (name === "statusHistory") {
        const s = inScope("content_item_id") ?? []
        return {
          docs: fx.history
            .filter((h) => s.includes(String(h.content_item_id)))
            .map((h, i) => ({ id: `h${i}`, data: () => h })),
        }
      }
      if (name === "adsMetrics") {
        const s = inScope("content_item_id") ?? []
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

import type { AuthedUser } from "@/lib/server/auth"
import {
  getPeriodComparison,
  getPeriodReport,
} from "@/modules/analytics/services/report.server"

// September 2026 in Asia/Ho_Chi_Minh
const SEP_START = Date.UTC(2026, 8, 1) - 7 * 3600 * 1000
const AUG_START = Date.UTC(2026, 7, 1) - 7 * 3600 * 1000
const DAY = 86400_000
const mgr: AuthedUser = { uid: "mgr", email: null, system_role: "manager" }

beforeEach(() => {
  fx.memberships = [{ project_id: "p1", project_role: "manager" }]
  fx.items = []
  fx.history = []
  fx.metrics = []
})

describe("getPeriodReport (SPEC §5.6 R3, task 8.3)", () => {
  it("400 on a bad period or date", async () => {
    await expect(getPeriodReport(mgr, "quarter", "2026-09-01")).rejects.toMatchObject({ status: 400 })
    await expect(getPeriodReport(mgr, "month", "nonsense")).rejects.toMatchObject({ status: 400 })
  })

  it("empty period → zeros + has_data false + 'chưa có dữ liệu' signal", async () => {
    const r = await getPeriodReport(mgr, "month", "2026-09-15")
    expect(r.has_data).toBe(false)
    expect(r).toMatchObject({ throughput: 0, total_spend: 0, weighted_roas: 0 })
    expect(r.period).toMatchObject({ kind: "month", start_date: "2026-09-01" })
  })

  it("counts the cohort that hit da_len_ads in the period + its ads figures", async () => {
    fx.items = [
      { id: "a", project_id: "p1", code: "A", deadline: ts(SEP_START + 10 * 86400_000) },
      { id: "b", project_id: "p1", code: "B", deadline: ts(SEP_START) }, // published late
      { id: "c", project_id: "p1", code: "C" }, // published in August, out of period
    ]
    fx.history = [
      { content_item_id: "a", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP_START + 5 * 86400_000) },
      { content_item_id: "b", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP_START + 6 * 86400_000) },
      { content_item_id: "c", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP_START - 86400_000) },
      // a return transition inside the period
      { content_item_id: "a", from_status: "cho_duyet_video", to_status: "quay_dung", created_at: ts(SEP_START + 2 * 86400_000) },
      // a return transition outside the period — not counted
      { content_item_id: "b", from_status: "cho_duyet_kich_ban", to_status: "viet_kich_ban", created_at: ts(SEP_START - 5 * 86400_000) },
    ]
    fx.metrics = [
      { id: "m-a", content_item_id: "a", source: "synced", spend: 100, messages: 4, roas: 3, ctr: 0, cost_per_purchase: 0, delivery_status: "active", captured_at: ts(SEP_START + 9e9), data_as_of: ts(SEP_START) },
      { id: "m-b", content_item_id: "b", source: "synced", spend: 300, messages: 6, roas: 5, ctr: 0, cost_per_purchase: 0, delivery_status: "active", captured_at: ts(SEP_START + 9e9), data_as_of: ts(SEP_START) },
    ]

    const r = await getPeriodReport(mgr, "month", "2026-09-15")
    expect(r.has_data).toBe(true)
    expect(r.throughput).toBe(2) // a, b (c is out of period)
    expect(r.on_time).toBe(1) // a on time, b late
    expect(r.returns).toBe(1) // only a's in-period return
    expect(r.total_spend).toBe(400)
    expect(r.total_messages).toBe(10)
    expect(r.weighted_roas).toBe((3 * 100 + 5 * 300) / 400)
    expect(r.top_by_roas.map((t) => t.code)).toEqual(["B", "A"])
  })

  it("items exist but none published in the period → has_data false, returns still counted", async () => {
    fx.items = [{ id: "a", project_id: "p1", code: "A" }]
    fx.history = [
      { content_item_id: "a", from_status: "cho_duyet_video", to_status: "quay_dung", created_at: ts(SEP_START + 3 * 86400_000) },
    ]
    const r = await getPeriodReport(mgr, "month", "2026-09-15")
    expect(r.has_data).toBe(false)
    expect(r.returns).toBe(1)
  })

  it("comparison: current + previous period reports with per-metric deltas (task 8.4)", async () => {
    fx.items = [
      { id: "s1", project_id: "p1", code: "S1", deadline: ts(SEP_START + 20 * DAY) },
      { id: "s2", project_id: "p1", code: "S2", deadline: ts(SEP_START + 20 * DAY) },
      { id: "a1", project_id: "p1", code: "A1", deadline: ts(AUG_START + 20 * DAY) },
    ]
    fx.history = [
      // September (current): 2 published, 1 return
      { content_item_id: "s1", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP_START + 3 * DAY) },
      { content_item_id: "s2", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP_START + 4 * DAY) },
      { content_item_id: "s1", from_status: "cho_duyet_video", to_status: "quay_dung", created_at: ts(SEP_START + 1 * DAY) },
      // August (previous): 1 published, 0 returns
      { content_item_id: "a1", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(AUG_START + 5 * DAY) },
    ]
    fx.metrics = [
      { id: "m-s1", content_item_id: "s1", source: "synced", spend: 100, messages: 3, roas: 4, ctr: 0, cost_per_purchase: 0, delivery_status: "active", captured_at: ts(9e12), data_as_of: ts(0) },
      { id: "m-s2", content_item_id: "s2", source: "synced", spend: 100, messages: 3, roas: 4, ctr: 0, cost_per_purchase: 0, delivery_status: "active", captured_at: ts(9e12), data_as_of: ts(0) },
      { id: "m-a1", content_item_id: "a1", source: "synced", spend: 100, messages: 5, roas: 2, ctr: 0, cost_per_purchase: 0, delivery_status: "active", captured_at: ts(9e12), data_as_of: ts(0) },
    ]

    const r = await getPeriodComparison(mgr, "month", "2026-09-15")

    expect(r.period).toMatchObject({ start_date: "2026-09-01" })
    expect(r.previous_period).toMatchObject({ start_date: "2026-08-01" })
    expect(r.current).toMatchObject({ throughput: 2, returns: 1, total_spend: 200 })
    expect(r.previous).toMatchObject({ throughput: 1, returns: 0, total_spend: 100 })
    expect(r.deltas.throughput).toMatchObject({ abs: 1, direction: "up", pct: 1 })
    expect(r.deltas.returns).toMatchObject({ abs: 1, pct: null }) // previous had 0
    expect(r.deltas.weighted_roas).toMatchObject({ abs: 2, direction: "up" }) // 4 vs 2
  })

  it("staff mode: only the caller's own items", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "staff" }]
    fx.items = [
      { id: "a", project_id: "p1", code: "A", assignee_id: "u1" },
      { id: "b", project_id: "p1", code: "B", assignee_id: "u2" },
    ]
    fx.history = [
      { content_item_id: "a", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP_START + 86400_000) },
      { content_item_id: "b", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP_START + 86400_000) },
    ]
    const r = await getPeriodReport(
      { uid: "u1", email: null, system_role: "staff" },
      "month",
      "2026-09-15"
    )
    expect(r.mode).toBe("staff")
    expect(r.throughput).toBe(1)
  })
})
