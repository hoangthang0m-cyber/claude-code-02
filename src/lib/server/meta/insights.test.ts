import { describe, expect, it, vi } from "vitest"

import {
  fetchAdObjectInsights,
  fetchDeliveryStatus,
  mapEffectiveStatus,
} from "@/lib/server/meta/insights"

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

describe("mapEffectiveStatus", () => {
  it("maps Meta statuses to the AdsMetric enum", () => {
    expect(mapEffectiveStatus("ACTIVE")).toBe("active")
    expect(mapEffectiveStatus("PAUSED")).toBe("paused")
    expect(mapEffectiveStatus("CAMPAIGN_PAUSED")).toBe("paused")
    expect(mapEffectiveStatus("ADSET_PAUSED")).toBe("paused")
    expect(mapEffectiveStatus("ARCHIVED")).toBe("completed")
    expect(mapEffectiveStatus("DELETED")).toBe("completed")
    expect(mapEffectiveStatus("DISAPPROVED")).toBe("unknown")
    expect(mapEffectiveStatus("")).toBe("unknown")
  })
})

describe("fetchAdObjectInsights (SPEC §5.4 R3, Q1)", () => {
  it("reads spend, messages, purchases, CPP, roas, ctr, start date", async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      const url = new URL(u)
      expect(url.pathname).toContain("/6300111/insights")
      expect(url.searchParams.get("date_preset")).toBe("maximum")
      return jsonRes({
        data: [
          {
            spend: "1500000",
            ctr: "1.8",
            date_start: "2026-08-01",
            actions: [
              { action_type: "messaging_conversation_started", value: "40" },
              { action_type: "omni_purchase", value: "12" },
              { action_type: "link_click", value: "500" },
            ],
            cost_per_action_type: [
              { action_type: "omni_purchase", value: "125000" },
            ],
            purchase_roas: [{ action_type: "omni_purchase", value: "3.4" }],
          },
        ],
      })
    })
    const r = await fetchAdObjectInsights("6300111", "tok", fetchImpl as never)
    expect(r).toEqual({
      object_id: "6300111",
      spend: 1500000,
      messages: 40,
      purchases: 12,
      cost_per_purchase: 125000,
      roas: 3.4,
      ctr: 1.8,
      ads_started_on: "2026-08-01",
    })
  })

  it("derives CPP from spend/purchases when Meta omits cost_per_action_type", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({
        data: [
          {
            spend: "600000",
            actions: [{ action_type: "omni_purchase", value: "3" }],
          },
        ],
      })
    )
    const r = await fetchAdObjectInsights("x", "t", fetchImpl as never)
    expect(r.cost_per_purchase).toBe(200000)
  })

  it("returns zeros when there is no insight row yet", async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ data: [] }))
    const r = await fetchAdObjectInsights("x", "t", fetchImpl as never)
    expect(r).toMatchObject({ spend: 0, messages: 0, purchases: 0, roas: 0 })
  })

  it("throws 502 on a Meta error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({ error: { message: "bad" } }, false, 400)
    )
    await expect(
      fetchAdObjectInsights("x", "t", fetchImpl as never)
    ).rejects.toMatchObject({ status: 502 })
  })
})

describe("fetchDeliveryStatus", () => {
  it("reads effective_status", async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      expect(new URL(u).searchParams.get("fields")).toBe("effective_status")
      return jsonRes({ effective_status: "PAUSED" })
    })
    expect(await fetchDeliveryStatus("x", "t", fetchImpl as never)).toBe("paused")
  })
})
