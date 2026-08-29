import { describe, expect, it } from "vitest"

import type { AdsDeliveryStatus } from "@/lib/domain"
import type { AdObjectInsights } from "@/lib/server/meta/insights"
import { aggregateMetrics } from "@/modules/ads-performance/services/metricsAggregate"

const ins = (o: Partial<AdObjectInsights>): AdObjectInsights => ({
  object_id: "o",
  spend: 0,
  messages: 0,
  purchases: 0,
  cost_per_purchase: 0,
  roas: 0,
  ctr: 0,
  ads_started_on: null,
  ...o,
})
const part = (o: Partial<AdObjectInsights>, s: AdsDeliveryStatus = "active") => ({
  insights: ins(o),
  delivery_status: s,
})

describe("aggregateMetrics — sums (SPEC §6.4)", () => {
  it("no parts → all zero, status unknown", () => {
    expect(aggregateMetrics([])).toEqual({
      spend: 0,
      messages: 0,
      purchases: 0,
      cost_per_purchase: 0,
      roas: 0,
      ctr: 0,
      delivery_status: "unknown",
      ads_started_on: null,
    })
  })

  it("one binding passes through unchanged", () => {
    const p = part({
      spend: 1_234_567,
      messages: 9,
      purchases: 4,
      roas: 2.7,
      ctr: 1.9,
      ads_started_on: "2026-08-03",
    })
    const r = aggregateMetrics([p])
    expect(r).toEqual({
      spend: 1_234_567,
      messages: 9,
      purchases: 4,
      cost_per_purchase: 1_234_567 / 4,
      roas: 2.7,
      ctr: 1.9,
      delivery_status: "active",
      ads_started_on: "2026-08-03",
    })
  })

  it("adds spend / messages / purchases across bindings", () => {
    const r = aggregateMetrics([
      part({ spend: 100, messages: 3, purchases: 1 }),
      part({ spend: 250, messages: 7, purchases: 2 }),
      part({ spend: 50, messages: 0, purchases: 0 }),
    ])
    expect(r.spend).toBe(400)
    expect(r.messages).toBe(10)
    expect(r.purchases).toBe(3)
  })
})

describe("aggregateMetrics — recomputed metrics (SPEC §5.4 R2)", () => {
  // WHEN a content item is bound to 2 different ads → THEN combine: add spend,
  // add Mess, recompute ROAS / CPP / CTR against the totals.
  it("the §5.4 R2 two-ad scenario", () => {
    const adA = part({
      spend: 3_000_000, // ₫
      messages: 30,
      purchases: 10,
      roas: 2.0,
      ctr: 1.5,
      ads_started_on: "2026-08-01",
    })
    const adB = part(
      {
        spend: 1_000_000,
        messages: 6,
        purchases: 2,
        roas: 5.0,
        ctr: 3.0,
        ads_started_on: "2026-08-10",
      },
      "paused"
    )
    const r = aggregateMetrics([adA, adB])

    expect(r.spend).toBe(4_000_000)
    expect(r.messages).toBe(36)
    expect(r.purchases).toBe(12)
    // CPP = total spend / total purchases
    expect(r.cost_per_purchase).toBeCloseTo(333_333.33, 1)
    // ROAS weighted by spend: (2·3M + 5·1M) / 4M = 2.75
    expect(r.roas).toBeCloseTo(2.75, 6)
    // CTR weighted by spend: (1.5·3M + 3·1M) / 4M = 1.875
    expect(r.ctr).toBeCloseTo(1.875, 6)
    // active (adA) beats paused (adB)
    expect(r.delivery_status).toBe("active")
    // earliest start date
    expect(r.ads_started_on).toBe("2026-08-01")
  })

  it("a big-spend low-ROAS ad dominates the weighted ROAS", () => {
    const r = aggregateMetrics([
      part({ spend: 9_000, roas: 1.0 }),
      part({ spend: 1_000, roas: 10.0 }),
    ])
    // (1·9000 + 10·1000) / 10000 = 1.9
    expect(r.roas).toBeCloseTo(1.9, 6)
  })

  it("ignores per-object cost_per_purchase — always recomputes from totals", () => {
    const r = aggregateMetrics([
      part({ spend: 500, purchases: 5, cost_per_purchase: 999_999 }),
      part({ spend: 500, purchases: 5, cost_per_purchase: 1 }),
    ])
    expect(r.cost_per_purchase).toBe(100) // 1000 / 10
  })

  it("CPP is 0 when nobody bought, even with spend", () => {
    expect(
      aggregateMetrics([part({ spend: 2_000_000, purchases: 0 })])
        .cost_per_purchase
    ).toBe(0)
  })

  it("ROAS and CTR are 0 when total spend is 0", () => {
    const r = aggregateMetrics([
      part({ spend: 0, roas: 4, ctr: 2 }, "paused"),
      part({ spend: 0, roas: 9, ctr: 5 }, "paused"),
    ])
    expect(r.roas).toBe(0)
    expect(r.ctr).toBe(0)
  })

  it("clamps negative / non-finite inputs to 0", () => {
    const r = aggregateMetrics([
      part({ spend: -100, messages: -3, purchases: Number.NaN, roas: -1 }),
      part({ spend: 200, messages: 4, purchases: 2, roas: 3 }),
    ])
    expect(r.spend).toBe(200)
    expect(r.messages).toBe(4)
    expect(r.purchases).toBe(2)
    expect(r.roas).toBe(3) // weighted only over the valid 200 spend
  })
})

describe("aggregateMetrics — delivery status precedence (SPEC §5.4 R3)", () => {
  const cases: Array<[AdsDeliveryStatus[], AdsDeliveryStatus]> = [
    [["active", "paused", "completed"], "active"],
    [["paused", "completed", "unknown"], "paused"],
    [["completed", "unknown"], "completed"],
    [["unknown", "unknown"], "unknown"],
  ]
  it.each(cases)("%j → %s", (statuses, expected) => {
    const r = aggregateMetrics(statuses.map((s) => part({ spend: 10 }, s)))
    expect(r.delivery_status).toBe(expected)
  })
})

describe("aggregateMetrics — ads_started_on", () => {
  it("earliest non-null wins; null when none is set", () => {
    expect(
      aggregateMetrics([
        part({ ads_started_on: null }),
        part({ ads_started_on: "2026-09-01" }),
        part({ ads_started_on: "2026-06-15" }),
      ]).ads_started_on
    ).toBe("2026-06-15")
    expect(
      aggregateMetrics([part({ ads_started_on: null })]).ads_started_on
    ).toBeNull()
  })
})
