import { beforeAll, describe, expect, it, vi } from "vitest"

import { ICT_OFFSET_MS } from "@/lib/domain"

// SPEC §5.6 R3 / R4, task 9.5: weekly / monthly reports + period comparison over
// ONE dataset whose StatusHistory + AdsMetric span three months. Proves the
// period boundary filtering (Asia/Ho_Chi_Minh, Monday weeks) and the delta
// arithmetic hold across periods — not just in isolation.

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
      const scope = (field: string): string[] | null => {
        const c = clauses.find((x) => x.startsWith(`${field}:[`))
        return c ? (JSON.parse(c.slice(field.length + 1)) as string[]) : null
      }
      if (name === "projectMembers") {
        return { docs: [{ data: () => ({ project_id: "p1", project_role: "manager" }) }] }
      }
      if (name === "contentItems") {
        return {
          docs: fx.items
            .filter((i) => (scope("project_id") ?? []).includes(String(i.project_id)))
            .map((i) => ({ id: i.id, data: () => i })),
        }
      }
      if (name === "statusHistory") {
        const s = scope("content_item_id") ?? []
        return {
          docs: fx.history
            .filter((h) => s.includes(String(h.content_item_id)))
            .map((h, i) => ({ id: `h${i}`, data: () => h })),
        }
      }
      if (name === "adsMetrics") {
        const s = scope("content_item_id") ?? []
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

const mgr: AuthedUser = { uid: "mgr", email: null, system_role: "manager" }

// local (ICT) wall-clock instant for a Y-M-D HH
const ict = (y: number, m: number, d: number, h = 12) =>
  Date.UTC(y, m - 1, d, h) - ICT_OFFSET_MS

// helpers to build the fixture
let n = 0
function published(month: number, day: number, opts: { deadlineDay?: number; roas: number; spend: number; msgs: number }) {
  const id = `ci-${++n}`
  fx.items.push({
    id,
    project_id: "p1",
    code: id.toUpperCase(),
    ...(opts.deadlineDay ? { deadline: ts(ict(2026, month, opts.deadlineDay)) } : {}),
  })
  fx.history.push({
    content_item_id: id,
    from_status: "da_duyet",
    to_status: "da_len_ads",
    created_at: ts(ict(2026, month, day, 10)),
  })
  fx.metrics.push({
    id: `m-${id}`,
    content_item_id: id,
    source: "synced",
    spend: opts.spend,
    messages: opts.msgs,
    roas: opts.roas,
    ctr: 0,
    cost_per_purchase: 0,
    delivery_status: "active",
    captured_at: ts(9e12),
    data_as_of: ts(0),
  })
  return id
}
function returnEvent(itemId: string, month: number, day: number) {
  fx.history.push({
    content_item_id: itemId,
    from_status: "cho_duyet_video",
    to_status: "quay_dung",
    created_at: ts(ict(2026, month, day)),
  })
}

beforeAll(() => {
  // July: 1 published (late), spend 100 roas 2
  const j1 = published(7, 20, { deadlineDay: 10, roas: 2, spend: 100, msgs: 4 }) // published 20th, deadline 10th → late
  returnEvent(j1, 7, 5)

  // August: 3 published (2 on time, 1 late), returns ×2
  const a1 = published(8, 5, { deadlineDay: 20, roas: 4, spend: 200, msgs: 10 })
  published(8, 12, { deadlineDay: 20, roas: 6, spend: 300, msgs: 12 })
  const a3 = published(8, 25, { deadlineDay: 10, roas: 1, spend: 50, msgs: 1 }) // late
  returnEvent(a1, 8, 2)
  returnEvent(a3, 8, 22)

  // September: 2 published, one at the very edge of the month (ICT)
  published(9, 1, { roas: 5, spend: 400, msgs: 20 }) // Sep 1 10:00 ICT
  published(9, 28, { roas: 3, spend: 100, msgs: 5 })

  // an August-edge publish: Aug 31 23:00 ICT — must land in August, not September
  const edge = `ci-edge`
  fx.items.push({ id: edge, project_id: "p1", code: "EDGE" })
  fx.history.push({
    content_item_id: edge,
    from_status: "da_duyet",
    to_status: "da_len_ads",
    created_at: ts(Date.UTC(2026, 7, 31, 23) - ICT_OFFSET_MS),
  })
  fx.metrics.push({
    id: "m-edge", content_item_id: edge, source: "synced", spend: 10, messages: 1,
    roas: 9, ctr: 0, cost_per_purchase: 0, delivery_status: "active",
    captured_at: ts(9e12), data_as_of: ts(0),
  })
})

describe("weekly/monthly report over a multi-period dataset (SPEC §5.6, task 9.5)", () => {
  it("month report: each month's cohort is exactly its da_len_ads events", async () => {
    const jul = await getPeriodReport(mgr, "month", "2026-07-15")
    expect(jul).toMatchObject({ throughput: 1, total_spend: 100, on_time: 0 })

    const aug = await getPeriodReport(mgr, "month", "2026-08-15")
    // 3 August + the Aug-31-23:00-ICT edge item = 4
    expect(aug.throughput).toBe(4)
    expect(aug.total_spend).toBe(200 + 300 + 50 + 10)
    // a1 (deadline 20 > published 5) + a2 (20 > 12) + edge (no deadline) on time;
    // a3 (deadline 10 < published 25) late
    expect(aug.on_time).toBe(3)
    expect(aug.on_time_rate).toBe(0.75)
  })

  it("the Aug-31 23:00 ICT publish counts in August, not September", async () => {
    const sep = await getPeriodReport(mgr, "month", "2026-09-20")
    expect(sep.throughput).toBe(2) // Sep 1 + Sep 28 only — NOT the edge item
    expect(sep.total_spend).toBe(500)
  })

  it("weighted ROAS is spend-weighted within the period", async () => {
    const aug = await getPeriodReport(mgr, "month", "2026-08-15")
    // (4*200 + 6*300 + 1*50 + 9*10) / 560
    expect(aug.weighted_roas).toBeCloseTo((4 * 200 + 6 * 300 + 1 * 50 + 9 * 10) / 560)
  })

  it("returns are counted per period, not per cohort", async () => {
    expect((await getPeriodReport(mgr, "month", "2026-07-15")).returns).toBe(1)
    expect((await getPeriodReport(mgr, "month", "2026-08-15")).returns).toBe(2)
    expect((await getPeriodReport(mgr, "month", "2026-09-15")).returns).toBe(0)
  })

  it("comparison Aug vs Jul: absolute + percentage deltas", async () => {
    const cmp = await getPeriodComparison(mgr, "month", "2026-08-15")
    expect(cmp.period.start_date).toBe("2026-08-01")
    expect(cmp.previous_period.start_date).toBe("2026-07-01")
    expect(cmp.current.throughput).toBe(4)
    expect(cmp.previous.throughput).toBe(1)
    expect(cmp.deltas.throughput).toMatchObject({ abs: 3, pct: 3, direction: "up" })
    expect(cmp.deltas.total_spend).toMatchObject({ abs: 460, direction: "up" })
  })

  it("comparison Jul vs Jun: previous period empty → pct null, current still reported", async () => {
    const cmp = await getPeriodComparison(mgr, "month", "2026-07-15")
    expect(cmp.previous.has_data).toBe(false)
    expect(cmp.deltas.throughput).toMatchObject({ abs: 1, previous: 0, pct: null })
  })

  it("a week report is a strict sub-window of the month", async () => {
    // the Monday week containing Aug 12 is Aug 10–16 → only a2 (published Aug 12)
    const week = await getPeriodReport(mgr, "week", "2026-08-12")
    expect(week.period.start_date).toBe("2026-08-10")
    expect(week.throughput).toBe(1)
    expect(week.total_spend).toBe(300)
  })

  it("a period with no da_len_ads events → has_data false", async () => {
    const r = await getPeriodReport(mgr, "month", "2026-05-15")
    expect(r).toMatchObject({ has_data: false, throughput: 0, returns: 0 })
  })
})
