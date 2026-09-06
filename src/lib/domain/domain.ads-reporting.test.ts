import { describe, expect, it } from "vitest"

import {
  adCreativeInsightSnapshotId,
  adAccountReportSyncStateId,
  adsInsightSnapshotId,
  campaignProductOverrideId,
  campaignProductOverrideWriteSchema,
  currencyRateId,
  currencyRateWriteSchema,
  productAccountRuleId,
  productAccountRuleWriteSchema,
  productWriteSchema,
  reportingSettingsWriteSchema,
} from "@/lib/domain"

// ads-overview-reporting change — group 1 tasks 1.1 / 1.2 / 1.5: the write
// schemas accept a valid body and reject a bad enum / missing field, same
// "clean migration" check the other data-model groups use. Plus the
// deterministic doc ids that stand in for the "UNIQUE" constraints.

describe("productWriteSchema (task 1.1)", () => {
  it("accepts a one-letter code + name, defaulting keywords to []", () => {
    const r = productWriteSchema.parse({ code: "H", name: "Hiếu Mệnh Dưỡng Con" })
    expect(r).toEqual({ code: "h", name: "Hiếu Mệnh Dưỡng Con", keywords: [] })
  })

  it("keeps supplied keywords", () => {
    const r = productWriteSchema.parse({
      code: "h",
      name: "x",
      keywords: ["hmdc"],
    })
    expect(r.keywords).toEqual(["hmdc"])
  })

  it("rejects a multi-letter code", () => {
    expect(productWriteSchema.safeParse({ code: "amhd", name: "x" }).success).toBe(
      false
    )
  })

  it("rejects a blank name", () => {
    expect(
      productWriteSchema.safeParse({ code: "a", name: "   " }).success
    ).toBe(false)
  })
})

describe("productAccountRuleWriteSchema (task 1.2)", () => {
  it("accepts a rule, defaulting is_account_default to false", () => {
    const r = productAccountRuleWriteSchema.parse({
      ad_account_id: "act_1",
      product_id: "a",
    })
    expect(r.is_account_default).toBe(false)
  })

  it("rejects a missing product_id", () => {
    expect(
      productAccountRuleWriteSchema.safeParse({ ad_account_id: "act_1" }).success
    ).toBe(false)
  })

  it("one rule per (account, product) via the doc id", () => {
    expect(productAccountRuleId("act_1", "a")).toBe("act_1__a")
  })
})

describe("campaignProductOverrideWriteSchema (task 1.2)", () => {
  it("accepts an override (set_by / set_at are server-set, not in the body)", () => {
    const r = campaignProductOverrideWriteSchema.parse({
      ad_account_id: "act_1",
      campaign_id: "c1",
      product_id: "t",
    })
    expect(r).toEqual({ ad_account_id: "act_1", campaign_id: "c1", product_id: "t" })
  })

  it("at most one override per (account, campaign) via the doc id", () => {
    expect(campaignProductOverrideId("act_1", "c1")).toBe("act_1__c1")
  })
})

describe("reportingSettingsWriteSchema (task 1.5)", () => {
  it("uppercases a 3-letter ISO currency", () => {
    expect(reportingSettingsWriteSchema.parse({ reporting_currency: "vnd" })).toEqual(
      { reporting_currency: "VND" }
    )
  })

  it("rejects a non-3-letter currency", () => {
    expect(
      reportingSettingsWriteSchema.safeParse({ reporting_currency: "DONG" }).success
    ).toBe(false)
  })
})

describe("currencyRateWriteSchema (task 1.5)", () => {
  it("accepts a positive rate with an ISO date", () => {
    const r = currencyRateWriteSchema.parse({
      from_currency: "usd",
      to_currency: "vnd",
      rate: 25000,
      effective_from: "2026-06-01",
    })
    expect(r).toMatchObject({ from_currency: "USD", to_currency: "VND", rate: 25000 })
  })

  it("rejects a non-positive rate", () => {
    expect(
      currencyRateWriteSchema.safeParse({
        from_currency: "USD",
        to_currency: "VND",
        rate: 0,
        effective_from: "2026-06-01",
      }).success
    ).toBe(false)
  })

  it("rejects a malformed effective_from", () => {
    expect(
      currencyRateWriteSchema.safeParse({
        from_currency: "USD",
        to_currency: "VND",
        rate: 1,
        effective_from: "01/06/2026",
      }).success
    ).toBe(false)
  })

  it("one rate per (from, to, effective_from) via the doc id", () => {
    expect(currencyRateId("USD", "VND", "2026-06-01")).toBe("USD__VND__2026-06-01")
  })
})

describe("snapshot doc ids (tasks 1.3 / 1.4) — the UNIQUE keys", () => {
  it("campaign snapshot id keys on (account, campaign, date)", () => {
    expect(adsInsightSnapshotId("act_1", "c1", "2026-06-01")).toBe(
      "act_1__c1__2026-06-01"
    )
  })

  it("ad snapshot id keys on (account, ad, date)", () => {
    expect(adCreativeInsightSnapshotId("act_1", "ad9", "2026-06-01")).toBe(
      "act_1__ad9__2026-06-01"
    )
  })

  it("sync-state id keys on (account, scope)", () => {
    expect(adAccountReportSyncStateId("act_1", "campaign")).toBe("act_1__campaign")
  })
})
