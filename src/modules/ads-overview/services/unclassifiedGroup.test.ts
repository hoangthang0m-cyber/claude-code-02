import { describe, expect, it } from "vitest"

import type { ClassifyConfig, CurrencyRateInput } from "@/lib/domain"
import {
  summarizeUnclassified,
  type UnclassifiedSnapshotRow,
} from "@/modules/ads-overview/services/unclassifiedGroup"

// acc-mapped has a rule; acc-orphan has none → its campaigns are "Chưa phân loại"
const config: ClassifyConfig = {
  products: [{ id: "a", code: "a", keywords: [] }],
  rules: [{ ad_account_id: "acc-mapped", product_id: "a", is_account_default: true }],
  overrides: [],
}

const row = (o: Partial<UnclassifiedSnapshotRow>): UnclassifiedSnapshotRow => ({
  ad_account_id: "acc-orphan",
  campaign_id: "c1",
  campaign_name: "video 1",
  stat_date: "2026-06-10",
  spend: 0,
  revenue: 0,
  account_currency: "VND",
  ...o,
})

describe("summarizeUnclassified (task 2.6)", () => {
  it("counts only campaigns on accounts with no rule, and sums their spend", () => {
    const s = summarizeUnclassified(
      [
        row({ campaign_id: "c1", spend: 100, revenue: 250 }),
        row({ campaign_id: "c1", spend: 50, revenue: 0, stat_date: "2026-06-11" }),
        row({ campaign_id: "c2", spend: 30, revenue: 10 }),
        // classified — excluded
        row({ ad_account_id: "acc-mapped", campaign_id: "c9", spend: 999, revenue: 999 }),
      ],
      config,
      [],
      "VND"
    )
    expect(s.campaign_count).toBe(2)
    expect(s.spend).toBe(180)
    expect(s.revenue).toBe(260)
    expect(s.accounts_missing_rate).toEqual([])
  })

  it("a code in the name pulls a campaign out of 'unclassified' even on an orphan account", () => {
    const s = summarizeUnclassified(
      [row({ campaign_id: "c3", campaign_name: "thắng - A(1/6)", spend: 40 })],
      config,
      [],
      "VND"
    )
    expect(s.campaign_count).toBe(0)
    expect(s.spend).toBe(0)
  })

  it("converts a foreign-currency account to the reporting currency by stat date", () => {
    const rates: CurrencyRateInput[] = [
      { from_currency: "USD", to_currency: "VND", rate: 25_000, effective_from: "2026-01-01" },
    ]
    const s = summarizeUnclassified(
      [row({ account_currency: "USD", spend: 2, revenue: 5 })],
      config,
      rates,
      "VND"
    )
    expect(s.spend).toBe(50_000)
    expect(s.revenue).toBe(125_000)
  })

  it("drops an account with no FX rate from the totals but still counts the campaign", () => {
    const s = summarizeUnclassified(
      [
        row({ ad_account_id: "acc-eur", campaign_id: "c4", account_currency: "EUR", spend: 9, revenue: 9 }),
        row({ campaign_id: "c5", spend: 100, revenue: 100 }),
      ],
      config,
      [],
      "VND"
    )
    expect(s.campaign_count).toBe(2)
    expect(s.spend).toBe(100)
    expect(s.accounts_missing_rate).toEqual(["acc-eur"])
  })
})
