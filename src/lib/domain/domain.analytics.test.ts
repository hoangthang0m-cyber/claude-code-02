import { describe, expect, it } from "vitest"

import {
  IN_PRODUCTION_STATUSES,
  PENDING_REVIEW_STATUSES,
  computePeriodReport,
  computePersonPerformance,
  computeProgressDashboard,
  type DashboardItemInput,
  type PersonItemInput,
  type ReportCohortItem,
} from "@/lib/domain/analytics"

const NOW = Date.UTC(2026, 8, 1) // 2026-09-01
const DAY = 86_400_000

const item = (over: Partial<DashboardItemInput>): DashboardItemInput => ({
  status: "viet_kich_ban",
  deadline_ms: null,
  ads_active: false,
  ...over,
})

describe("progress-dashboard status buckets (SPEC §5.6 R1, task 8.1)", () => {
  it("partitions every status into exactly one of production / review / published", () => {
    const all = [
      ...IN_PRODUCTION_STATUSES,
      ...PENDING_REVIEW_STATUSES,
      "da_len_ads" as const,
    ]
    // the three sets are disjoint and cover the 7 states
    expect(new Set(all).size).toBe(7)
  })

  it("counts đang sản xuất / chờ duyệt / đã lên ads and total is their sum", () => {
    const d = computeProgressDashboard(
      [
        item({ status: "chua_bat_dau" }),
        item({ status: "viet_kich_ban" }),
        item({ status: "quay_dung" }),
        item({ status: "da_duyet" }),
        item({ status: "cho_duyet_kich_ban" }),
        item({ status: "cho_duyet_video" }),
        item({ status: "da_len_ads" }),
        item({ status: "da_len_ads" }),
      ],
      NOW
    )
    expect(d).toMatchObject({
      total: 8,
      in_production: 4,
      pending_review: 2,
      published: 2,
    })
    expect(d.in_production + d.pending_review + d.published).toBe(d.total)
  })

  it("empty input → all zeros", () => {
    expect(computeProgressDashboard([], NOW)).toEqual({
      total: 0,
      in_production: 0,
      pending_review: 0,
      overdue: 0,
      published: 0,
      ads_running: 0,
    })
  })
})

describe("progress-dashboard overdue (§6.7: deadline < now AND status != da_len_ads)", () => {
  it("past deadline + still in the pipeline → overdue", () => {
    const d = computeProgressDashboard(
      [item({ status: "quay_dung", deadline_ms: NOW - DAY })],
      NOW
    )
    expect(d.overdue).toBe(1)
  })

  it("past deadline but already on ads → not overdue", () => {
    const d = computeProgressDashboard(
      [item({ status: "da_len_ads", deadline_ms: NOW - DAY })],
      NOW
    )
    expect(d.overdue).toBe(0)
  })

  it("future deadline or no deadline → not overdue", () => {
    const d = computeProgressDashboard(
      [
        item({ deadline_ms: NOW + DAY }),
        item({ deadline_ms: null }),
        item({ deadline_ms: NOW }), // exactly now is not < now
      ],
      NOW
    )
    expect(d.overdue).toBe(0)
  })

  it("overdue overlaps a bucket, it is not its own bucket", () => {
    const d = computeProgressDashboard(
      [item({ status: "cho_duyet_video", deadline_ms: NOW - DAY })],
      NOW
    )
    expect(d).toMatchObject({ total: 1, pending_review: 1, overdue: 1 })
  })
})

describe("progress-dashboard ads đang chạy", () => {
  it("counts items with an active current ad, any status", () => {
    const d = computeProgressDashboard(
      [
        item({ status: "da_len_ads", ads_active: true }),
        item({ status: "da_duyet", ads_active: true }),
        item({ status: "da_len_ads", ads_active: false }),
      ],
      NOW
    )
    expect(d.ads_running).toBe(2)
    expect(d.published).toBe(2)
  })
})

describe("computePersonPerformance (SPEC §5.6 R2, task 8.2)", () => {
  const PERIOD = { from_ms: Date.UTC(2026, 8, 1), to_ms: Date.UTC(2026, 9, 1) }
  const pItem = (over: Partial<PersonItemInput>): PersonItemInput => ({
    status: "viet_kich_ban",
    deadline_ms: null,
    started_ms: null,
    approved_ms: null,
    ...over,
  })

  it("in_progress excludes da_duyet and da_len_ads", () => {
    const p = computePersonPerformance(
      [
        pItem({ status: "chua_bat_dau" }),
        pItem({ status: "quay_dung" }),
        pItem({ status: "da_duyet" }),
        pItem({ status: "da_len_ads" }),
      ],
      PERIOD,
      NOW
    )
    expect(p.in_progress).toBe(2)
  })

  it("overdue counts the person's late items and sets the flag", () => {
    const p = computePersonPerformance(
      [
        pItem({ status: "quay_dung", deadline_ms: NOW - DAY }),
        pItem({ status: "viet_kich_ban", deadline_ms: NOW + DAY }),
        pItem({ status: "da_len_ads", deadline_ms: NOW - DAY }), // published, not overdue
      ],
      PERIOD,
      NOW
    )
    expect(p.overdue).toBe(1)
    expect(p.has_overdue).toBe(true)
  })

  it("completed_in_period counts only da_duyet timestamps inside [from, to)", () => {
    const p = computePersonPerformance(
      [
        pItem({ approved_ms: PERIOD.from_ms }), // inclusive start → in
        pItem({ approved_ms: PERIOD.from_ms + DAY }), // in
        pItem({ approved_ms: PERIOD.from_ms - DAY }), // before → out
        pItem({ approved_ms: PERIOD.to_ms }), // exclusive end → out
        pItem({ approved_ms: null }), // never approved → out
      ],
      PERIOD,
      NOW
    )
    expect(p.completed_in_period).toBe(2)
  })

  it("avg_lead_time_ms is the mean (approved − started) over in-period items", () => {
    const p = computePersonPerformance(
      [
        pItem({ started_ms: PERIOD.from_ms, approved_ms: PERIOD.from_ms + 2 * DAY }),
        pItem({ started_ms: PERIOD.from_ms, approved_ms: PERIOD.from_ms + 4 * DAY }),
        // approved before this period → not in the average
        pItem({ started_ms: 0, approved_ms: PERIOD.from_ms - DAY }),
      ],
      PERIOD,
      NOW
    )
    expect(p.completed_in_period).toBe(2)
    expect(p.avg_lead_time_ms).toBe(3 * DAY)
  })

  it("an in-period completion with no start entry is counted but excluded from the average", () => {
    const p = computePersonPerformance(
      [pItem({ started_ms: null, approved_ms: PERIOD.from_ms + DAY })],
      PERIOD,
      NOW
    )
    expect(p.completed_in_period).toBe(1)
    expect(p.avg_lead_time_ms).toBeNull()
  })

  it("nobody completed in the period → avg is null", () => {
    const p = computePersonPerformance([pItem({ status: "quay_dung" })], PERIOD, NOW)
    expect(p).toMatchObject({ completed_in_period: 0, avg_lead_time_ms: null })
  })
})

describe("progress-dashboard — sample dataset", () => {
  it("matches the expected counts", () => {
    const items: DashboardItemInput[] = [
      item({ status: "chua_bat_dau" }),
      item({ status: "viet_kich_ban", deadline_ms: NOW - DAY }), // overdue
      item({ status: "cho_duyet_kich_ban" }),
      item({ status: "cho_duyet_video", deadline_ms: NOW - 2 * DAY }), // overdue
      item({ status: "da_duyet", ads_active: false }),
      item({ status: "da_len_ads", ads_active: true }),
      item({ status: "da_len_ads", ads_active: true, deadline_ms: NOW - DAY }), // not overdue (published)
    ]
    expect(computeProgressDashboard(items, NOW)).toEqual({
      total: 7,
      in_production: 3, // chua_bat_dau, viet_kich_ban, da_duyet
      pending_review: 2,
      published: 2,
      overdue: 2,
      ads_running: 2,
    })
  })
})

describe("computePeriodReport (SPEC §5.6 R3, task 8.3)", () => {
  const cItem = (over: Partial<ReportCohortItem>): ReportCohortItem => ({
    content_item_id: "ci",
    code: "C",
    published_ms: 1_000,
    deadline_ms: null,
    ads: null,
    ...over,
  })

  it("empty cohort → all zeros + has_data false, but returns still reported", () => {
    expect(computePeriodReport([], 3)).toEqual({
      has_data: false,
      throughput: 0,
      on_time: 0,
      on_time_rate: 0,
      returns: 3,
      total_spend: 0,
      total_messages: 0,
      weighted_roas: 0,
      top_by_roas: [],
    })
  })

  it("throughput = cohort size; on-time = published by deadline (null deadline = on time)", () => {
    const r = computePeriodReport(
      [
        cItem({ published_ms: 100, deadline_ms: 200 }), // on time
        cItem({ published_ms: 300, deadline_ms: 200 }), // late
        cItem({ published_ms: 300, deadline_ms: null }), // on time (no deadline)
        cItem({ published_ms: 200, deadline_ms: 200 }), // on time (== deadline)
      ],
      0
    )
    expect(r).toMatchObject({ has_data: true, throughput: 4, on_time: 3 })
    expect(r.on_time_rate).toBe(0.75)
  })

  it("spend + messages sum only items with ads; ROAS is spend-weighted", () => {
    const r = computePeriodReport(
      [
        cItem({ ads: { spend: 100, messages: 5, roas: 2 } }),
        cItem({ ads: { spend: 300, messages: 15, roas: 4 } }),
        cItem({ ads: null }), // published but no metric yet
      ],
      0
    )
    expect(r.total_spend).toBe(400)
    expect(r.total_messages).toBe(20)
    // (2*100 + 4*300) / 400 = 1400/400 = 3.5
    expect(r.weighted_roas).toBe(3.5)
  })

  it("weighted ROAS is 0 when nothing was spent", () => {
    const r = computePeriodReport(
      [cItem({ ads: { spend: 0, messages: 0, roas: 9 } })],
      0
    )
    expect(r.weighted_roas).toBe(0)
  })

  it("top_by_roas is the ads items ranked by ROAS, capped", () => {
    const r = computePeriodReport(
      [
        cItem({ content_item_id: "a", code: "A", ads: { spend: 1, messages: 0, roas: 1 } }),
        cItem({ content_item_id: "b", code: "B", ads: { spend: 1, messages: 0, roas: 9 } }),
        cItem({ content_item_id: "c", code: "C", ads: { spend: 1, messages: 0, roas: 5 } }),
        cItem({ content_item_id: "d", code: "D", ads: null }),
      ],
      0,
      2
    )
    expect(r.top_by_roas.map((t) => t.code)).toEqual(["B", "C"])
  })
})
