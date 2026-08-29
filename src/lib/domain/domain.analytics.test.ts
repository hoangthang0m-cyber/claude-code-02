import { describe, expect, it } from "vitest"

import {
  IN_PRODUCTION_STATUSES,
  PENDING_REVIEW_STATUSES,
  computePersonPerformance,
  computeProgressDashboard,
  type DashboardItemInput,
  type PersonItemInput,
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
