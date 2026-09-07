import { describe, expect, it } from "vitest"

import {
  aggregateSnapshots,
  convertCurrency,
  ratioOrNull,
  type CurrencyRateInput,
  type SnapshotTotalsInput,
} from "@/lib/domain/adsReporting"

const row = (o: Partial<SnapshotTotalsInput>): SnapshotTotalsInput => ({
  spend: 0,
  revenue: 0,
  purchases: 0,
  impressions: 0,
  clicks: 0,
  ...o,
})

describe("aggregateSnapshots (task 1.6)", () => {
  it("sums every additive field across rows", () => {
    const a = aggregateSnapshots([
      row({ spend: 100, revenue: 300, purchases: 3, impressions: 1000, clicks: 50 }),
      row({ spend: 50, revenue: 100, purchases: 1, impressions: 500, clicks: 25 }),
    ])
    expect(a.spend).toBe(150)
    expect(a.revenue).toBe(400)
    expect(a.purchases).toBe(4)
    expect(a.impressions).toBe(1500)
    expect(a.clicks).toBe(75)
  })

  it("derives ROAS, cost-per-purchase and CTR from the totals", () => {
    const a = aggregateSnapshots([
      row({ spend: 200, revenue: 500, purchases: 4, impressions: 1000, clicks: 20 }),
    ])
    expect(a.roas).toBeCloseTo(2.5)
    expect(a.cost_per_purchase).toBeCloseTo(50)
    expect(a.ctr).toBeCloseTo(0.02)
  })

  it("computes hook rate and retention from video plays (spec §5.4 scenario)", () => {
    const a = aggregateSnapshots([
      row({ video_plays: 10_000, video_3s_plays: 6_000, video_p100_plays: 1_500 }),
    ])
    expect(a.hook_rate).toBeCloseTo(0.6)
    expect(a.retention_rate).toBeCloseTo(0.25)
  })

  it("returns null (not 0, not Infinity) on a zero denominator", () => {
    const a = aggregateSnapshots([row({ spend: 0, revenue: 40, purchases: 0, impressions: 0 })])
    expect(a.roas).toBeNull() // revenue / 0 spend
    expect(a.cost_per_purchase).toBeNull() // spend / 0 purchases
    expect(a.ctr).toBeNull() // clicks / 0 impressions
    expect(a.hook_rate).toBeNull()
    expect(a.retention_rate).toBeNull()
  })

  it("ROAS is 0 (not null) when there is spend but no revenue", () => {
    const a = aggregateSnapshots([row({ spend: 80, revenue: 0 })])
    expect(a.roas).toBe(0)
  })

  it("empty input yields all-zero totals and all-null ratios", () => {
    const a = aggregateSnapshots([])
    expect(a.spend).toBe(0)
    expect(a.roas).toBeNull()
    expect(a.cost_per_purchase).toBeNull()
  })

  it("ratioOrNull guards the divide", () => {
    expect(ratioOrNull(10, 0)).toBeNull()
    expect(ratioOrNull(10, 5)).toBe(2)
  })
})

describe("convertCurrency (task 1.7)", () => {
  const rates: CurrencyRateInput[] = [
    { from_currency: "USD", to_currency: "VND", rate: 24_000, effective_from: "2026-01-01" },
    { from_currency: "USD", to_currency: "VND", rate: 25_000, effective_from: "2026-06-01" },
  ]

  it("returns the amount unchanged when currencies match", () => {
    expect(convertCurrency(500, "VND", "VND", [])).toEqual({
      ok: true,
      value: 500,
      rate: 1,
    })
  })

  it("converts with the current (newest) rate when no date is given", () => {
    const r = convertCurrency(2, "USD", "VND", rates)
    expect(r).toEqual({ ok: true, value: 50_000, rate: 25_000 })
  })

  it("uses the newest rate effective on or before the stat date", () => {
    const r = convertCurrency(2, "USD", "VND", rates, "2026-03-15")
    expect(r).toEqual({ ok: true, value: 48_000, rate: 24_000 })
  })

  it("falls back to the current rate when the date precedes every entry", () => {
    const r = convertCurrency(2, "USD", "VND", rates, "2025-01-01")
    expect(r).toEqual({ ok: true, value: 50_000, rate: 25_000 })
  })

  it("flags a missing pair so the account is dropped from the total", () => {
    expect(convertCurrency(2, "EUR", "VND", rates)).toEqual({
      ok: false,
      reason: "missing_rate",
    })
  })
})
