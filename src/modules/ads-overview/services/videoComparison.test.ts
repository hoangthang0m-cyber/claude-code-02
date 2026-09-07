import { describe, expect, it } from "vitest"

import type { CurrencyRateInput } from "@/lib/domain"
import {
  buildVideoComparison,
  buildVideoComparisonSeries,
  type VideoItemInput,
  type VideoSnapshotRow,
} from "@/modules/ads-overview/services/videoComparison"

const row = (o: Partial<VideoSnapshotRow>): VideoSnapshotRow => ({
  ad_account_id: "acc",
  ad_id: "ad1",
  stat_date: "2026-06-10",
  spend: 0,
  revenue: 0,
  purchases: 0,
  impressions: 0,
  clicks: 0,
  video_plays: 0,
  video_3s_plays: 0,
  video_p100_plays: 0,
  account_currency: "VND",
  ...o,
})

const item = (o: Partial<VideoItemInput>): VideoItemInput => ({
  content_item_id: "ci1",
  code: "V1",
  has_binding: true,
  snapshots: [],
  ...o,
})

describe("buildVideoComparison (task 6.3)", () => {
  it("marks an item with no binding and one still syncing", () => {
    const r = buildVideoComparison(
      [
        item({ content_item_id: "a", has_binding: false }),
        item({ content_item_id: "b", has_binding: true, snapshots: [] }),
      ],
      [],
      "VND"
    )
    expect(r.items[0].status).toBe("no_binding")
    expect(r.items[1].status).toBe("pending")
  })

  it("computes hook rate and retention per the spec scenario", () => {
    const r = buildVideoComparison(
      [
        item({
          snapshots: [
            row({ video_plays: 10_000, video_3s_plays: 6_000, video_p100_plays: 1_500 }),
          ],
        }),
      ],
      [],
      "VND"
    )
    expect(r.items[0].metrics.hook_rate).toBeCloseTo(0.6)
    expect(r.items[0].metrics.retention_rate).toBeCloseTo(0.25)
  })

  it("sums across a video's multiple ads before taking the ratios", () => {
    const r = buildVideoComparison(
      [
        item({
          snapshots: [
            row({ ad_id: "adA", spend: 100, revenue: 300, purchases: 2 }),
            row({ ad_id: "adB", spend: 100, revenue: 100, purchases: 0 }),
          ],
        }),
      ],
      [],
      "VND"
    )
    expect(r.items[0].metrics.spend).toBe(200)
    expect(r.items[0].metrics.roas).toBeCloseTo(2) // 400 / 200
    expect(r.items[0].metrics.cost_per_purchase).toBeCloseTo(100) // 200 / 2
  })

  it("cost-per-purchase and ROAS are null with 0 purchases / 0 spend", () => {
    const r = buildVideoComparison(
      [item({ snapshots: [row({ spend: 50, revenue: 0, purchases: 0 })] })],
      [],
      "VND"
    )
    expect(r.items[0].metrics.cost_per_purchase).toBeNull()
    expect(r.items[0].metrics.roas).toBe(0) // spend>0, revenue 0 → 0
  })

  it("converts foreign currency and flags an account with no rate", () => {
    const rates: CurrencyRateInput[] = [
      { from_currency: "USD", to_currency: "VND", rate: 25_000, effective_from: "2026-01-01" },
    ]
    const r = buildVideoComparison(
      [
        item({
          snapshots: [
            row({ ad_account_id: "us", account_currency: "USD", spend: 2, revenue: 4 }),
            row({ ad_account_id: "eu", account_currency: "EUR", spend: 9, revenue: 9 }),
          ],
        }),
      ],
      rates,
      "VND"
    )
    expect(r.items[0].metrics.spend).toBe(50_000)
    expect(r.accounts_missing_rate).toEqual(["eu"])
  })
})

describe("buildVideoComparisonSeries (task 6.6)", () => {
  it("one line per video, bucketed by day", () => {
    const s = buildVideoComparisonSeries(
      [
        item({
          content_item_id: "a",
          snapshots: [
            row({ stat_date: "2026-06-01", video_plays: 100, video_3s_plays: 60 }),
            row({ stat_date: "2026-06-02", video_plays: 200, video_3s_plays: 100 }),
          ],
        }),
      ],
      [],
      "VND",
      "day"
    )
    expect(s.buckets).toEqual(["2026-06-01", "2026-06-02"])
    expect(s.series[0].points.map((p) => p.hook_rate)).toEqual([0.6, 0.5])
  })
})
