import { describe, expect, it } from "vitest"

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

describe("aggregateMetrics (SPEC §5.4 R2, §6.4)", () => {
  it("returns zeros for no parts", () => {
    expect(aggregateMetrics([])).toMatchObject({
      spend: 0,
      delivery_status: "unknown",
      ads_started_on: null,
    })
  })

  it("passes a single binding straight through", () => {
    const r = aggregateMetrics([
      {
        insights: ins({ spend: 100, messages: 5, purchases: 2, roas: 3, ctr: 1.5 }),
        delivery_status: "active",
      },
    ])
    expect(r).toMatchObject({
      spend: 100,
      messages: 5,
      purchases: 2,
      cost_per_purchase: 50,
      roas: 3,
      ctr: 1.5,
      delivery_status: "active",
    })
  })

  it("sums spend/messages/purchases and re-weights roas/ctr by spend", () => {
    const r = aggregateMetrics([
      {
        insights: ins({ spend: 300, messages: 6, purchases: 3, roas: 4, ctr: 2 }),
        delivery_status: "active",
      },
      {
        insights: ins({ spend: 100, messages: 2, purchases: 1, roas: 8, ctr: 1 }),
        delivery_status: "paused",
      },
    ])
    expect(r.spend).toBe(400)
    expect(r.messages).toBe(8)
    expect(r.purchases).toBe(4)
    expect(r.cost_per_purchase).toBe(100) // 400 / 4
    // roas weighted by spend: (4*300 + 8*100) / 400 = 5
    expect(r.roas).toBe(5)
    // ctr weighted: (2*300 + 1*100) / 400 = 1.75
    expect(r.ctr).toBe(1.75)
    // active beats paused
    expect(r.delivery_status).toBe("active")
  })

  it("cost_per_purchase is 0 when there are no purchases", () => {
    const r = aggregateMetrics([
      { insights: ins({ spend: 500, purchases: 0 }), delivery_status: "active" },
    ])
    expect(r.cost_per_purchase).toBe(0)
  })

  it("roas/ctr are 0 when total spend is 0", () => {
    const r = aggregateMetrics([
      { insights: ins({ spend: 0, roas: 5, ctr: 3 }), delivery_status: "paused" },
    ])
    expect(r.roas).toBe(0)
    expect(r.ctr).toBe(0)
  })

  it("delivery status precedence active > paused > completed > unknown", () => {
    expect(
      aggregateMetrics([
        { insights: ins({}), delivery_status: "completed" },
        { insights: ins({}), delivery_status: "paused" },
      ]).delivery_status
    ).toBe("paused")
    expect(
      aggregateMetrics([
        { insights: ins({}), delivery_status: "unknown" },
        { insights: ins({}), delivery_status: "completed" },
      ]).delivery_status
    ).toBe("completed")
  })

  it("takes the earliest ads_started_on", () => {
    const r = aggregateMetrics([
      { insights: ins({ ads_started_on: "2026-08-10" }), delivery_status: "active" },
      { insights: ins({ ads_started_on: "2026-07-01" }), delivery_status: "active" },
      { insights: ins({ ads_started_on: null }), delivery_status: "active" },
    ])
    expect(r.ads_started_on).toBe("2026-07-01")
  })
})
