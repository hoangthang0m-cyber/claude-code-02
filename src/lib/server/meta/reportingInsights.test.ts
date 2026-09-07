import { describe, expect, it, vi } from "vitest"

import {
  fetchAdInsights,
  fetchAdReach,
  fetchCampaignInsights,
  ReachCache,
} from "@/lib/server/meta/reportingInsights"

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

describe("fetchCampaignInsights (task 3.1)", () => {
  it("requests level=campaign, time_increment=1, the given time_range", async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      const url = new URL(u)
      expect(url.pathname).toContain("/act_555/insights")
      expect(url.searchParams.get("level")).toBe("campaign")
      expect(url.searchParams.get("time_increment")).toBe("1")
      expect(JSON.parse(url.searchParams.get("time_range")!)).toEqual({
        since: "2026-06-01",
        until: "2026-06-30",
      })
      return jsonRes({ data: [] })
    })
    await fetchCampaignInsights("555", "tok", "2026-06-01", "2026-06-30", fetchImpl as never)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("pulls revenue + purchases from the omni_purchase action", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({
        data: [
          {
            campaign_id: "c1",
            campaign_name: "thắng - T(1/6)",
            objective: "OUTCOME_SALES",
            date_start: "2026-06-01",
            spend: "1000000",
            impressions: "50000",
            clicks: "800",
            actions: [
              { action_type: "omni_purchase", value: "4" },
              { action_type: "link_click", value: "800" },
            ],
            action_values: [{ action_type: "omni_purchase", value: "3200000" }],
          },
        ],
      })
    )
    const rows = await fetchCampaignInsights("555", "tok", "2026-06-01", "2026-06-30", fetchImpl as never)
    expect(rows).toEqual([
      {
        campaign_id: "c1",
        campaign_name: "thắng - T(1/6)",
        objective: "OUTCOME_SALES",
        stat_date: "2026-06-01",
        spend: 1_000_000,
        revenue: 3_200_000,
        purchases: 4,
        impressions: 50_000,
        clicks: 800,
      },
    ])
  })

  it("follows paging.next", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonRes({
          data: [{ campaign_id: "c1", date_start: "2026-06-01", spend: "10" }],
          paging: { next: "https://graph.facebook.com/v21.0/act_555/insights?after=X" },
        })
      )
      .mockResolvedValueOnce(
        jsonRes({ data: [{ campaign_id: "c1", date_start: "2026-06-02", spend: "20" }] })
      )
    const rows = await fetchCampaignInsights("555", "tok", "2026-06-01", "2026-06-30", fetchImpl as never)
    expect(rows.map((r) => r.stat_date)).toEqual(["2026-06-01", "2026-06-02"])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe("fetchAdInsights (task 3.2)", () => {
  it("returns [] and does not call Meta when no ad ids are given", async () => {
    const fetchImpl = vi.fn()
    expect(await fetchAdInsights("555", "tok", [], "2026-06-01", "2026-06-30", fetchImpl as never)).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("filters to the given ad ids and extracts the video metrics", async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      const url = new URL(u)
      expect(url.searchParams.get("level")).toBe("ad")
      expect(JSON.parse(url.searchParams.get("filtering")!)).toEqual([
        { field: "ad.id", operator: "IN", value: ["ad1", "ad2"] },
      ])
      return jsonRes({
        data: [
          {
            ad_id: "ad1",
            ad_name: "video A",
            campaign_id: "c1",
            date_start: "2026-06-01",
            spend: "500000",
            impressions: "20000",
            clicks: "300",
            actions: [{ action_type: "omni_purchase", value: "2" }],
            action_values: [{ action_type: "omni_purchase", value: "1500000" }],
            video_play_actions: [{ action_type: "video_view", value: "10000" }],
            video_3_sec_watched_actions: [{ action_type: "video_view", value: "6000" }],
            video_p100_watched_actions: [{ action_type: "video_view", value: "1500" }],
          },
        ],
      })
    })
    const rows = await fetchAdInsights("555", "tok", ["ad1", "ad2", "ad1"], "2026-06-01", "2026-06-30", fetchImpl as never)
    expect(rows[0]).toMatchObject({
      ad_id: "ad1",
      revenue: 1_500_000,
      purchases: 2,
      video_plays: 10_000,
      video_3s_plays: 6_000,
      video_p100_plays: 1_500,
    })
  })
})

describe("fetchAdReach + ReachCache (task 3.3)", () => {
  it("queries the whole period once, without time_increment", async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      const url = new URL(u)
      expect(url.searchParams.has("time_increment")).toBe(false)
      expect(url.searchParams.get("fields")).toBe("reach")
      return jsonRes({ data: [{ reach: "12345" }] })
    })
    expect(await fetchAdReach("ad1", "tok", "2026-06-01", "2026-06-30", fetchImpl as never)).toBe(12345)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("caches by (ad, period) and re-queries a different period", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ data: [{ reach: "100" }] }))
      .mockResolvedValueOnce(jsonRes({ data: [{ reach: "200" }] }))
    const cache = new ReachCache("tok", fetchImpl as never)

    expect(await cache.get("ad1", "2026-06-01", "2026-06-30")).toBe(100)
    expect(await cache.get("ad1", "2026-06-01", "2026-06-30")).toBe(100) // cached
    expect(fetchImpl).toHaveBeenCalledOnce()

    expect(await cache.get("ad1", "2026-07-01", "2026-07-31")).toBe(200) // new period
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
