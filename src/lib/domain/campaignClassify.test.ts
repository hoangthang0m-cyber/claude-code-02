import { describe, expect, it } from "vitest"

import {
  classifyCampaign,
  normalizeCampaignName,
  productCodeInName,
  type ClassifyConfig,
} from "@/lib/domain/campaignClassify"

describe("normalizeCampaignName (task 2.1)", () => {
  it("lowercases, strips Vietnamese diacritics and đ", () => {
    expect(normalizeCampaignName("Độ - Hẻm TBĐM")).toBe("do - hem tbdm")
  })

  it("collapses runs of whitespace and trims", () => {
    expect(normalizeCampaignName("  thắng   -   T(20/8)  ")).toBe("thang - t(20/8)")
  })
})

describe("productCodeInName (task 2.2)", () => {
  it.each(["t(20/8)", "a - ", "h(16/8)", "- t (5/9)", "thang - t(20/8)"])(
    "matches a standalone code token in %j",
    (name) => {
      expect(productCodeInName(name)).not.toBeNull()
    }
  )

  it("returns the matched letter", () => {
    expect(productCodeInName("thang - h(16/8) - video 2")).toBe("h")
  })

  it.each(["thang", "content", "chien dich thang 9", "ath khong co dau"])(
    "does not match a letter inside a word: %j",
    (name) => {
      expect(productCodeInName(name)).toBeNull()
    }
  )
})

// seed-shaped config: AMHD accounts default to product a; the shared accounts
// carry both t and h with t as the default (design.md Decision 2).
const config: ClassifyConfig = {
  products: [
    { id: "prod-a", code: "a", keywords: [] },
    { id: "prod-t", code: "t", keywords: [] },
    { id: "prod-h", code: "h", keywords: ["hmdc"] },
  ],
  rules: [
    { ad_account_id: "acc-amhd", product_id: "prod-a", is_account_default: true },
    { ad_account_id: "acc-shared", product_id: "prod-t", is_account_default: true },
    { ad_account_id: "acc-shared", product_id: "prod-h", is_account_default: false },
  ],
  overrides: [
    { ad_account_id: "acc-shared", campaign_id: "camp-pinned", product_id: "prod-a" },
  ],
}

describe("classifyCampaign (task 2.3)", () => {
  it("a manual override wins over everything", () => {
    expect(
      classifyCampaign(
        { ad_account_id: "acc-shared", campaign_id: "camp-pinned", campaign_name: "T(1/9)" },
        config
      )
    ).toEqual({ product_id: "prod-a", reason: "override" })
  })

  it("a keyword in the name (HMDC) picks that product", () => {
    expect(
      classifyCampaign(
        { ad_account_id: "acc-shared", campaign_id: "c1", campaign_name: "thắng - HMDC - video 1" },
        config
      )
    ).toEqual({ product_id: "prod-h", reason: "keyword" })
  })

  it("a code token in the name picks that product", () => {
    expect(
      classifyCampaign(
        { ad_account_id: "acc-shared", campaign_id: "c2", campaign_name: "thắng - T(20/8) - video 1" },
        config
      )
    ).toEqual({ product_id: "prod-t", reason: "code" })
  })

  it("falls back to the account default when the name has no code", () => {
    expect(
      classifyCampaign(
        { ad_account_id: "acc-amhd", campaign_id: "c3", campaign_name: "chiến dịch tháng 9" },
        config
      )
    ).toEqual({ product_id: "prod-a", reason: "account_default" })
  })

  it("a code in the name still classifies even on an unconfigured account", () => {
    expect(
      classifyCampaign(
        { ad_account_id: "acc-unknown", campaign_id: "c4", campaign_name: "T(1/1)" },
        config
      )
    ).toEqual({ product_id: "prod-t", reason: "code" })
  })

  it("a code-less campaign on an unconfigured account is 'Chưa phân loại' (null)", () => {
    expect(
      classifyCampaign(
        { ad_account_id: "acc-unknown", campaign_id: "c4b", campaign_name: "video chưa gắn" },
        config
      )
    ).toEqual({ product_id: null, reason: "unconfigured_account" })
  })

  it("a shared-account code-less campaign takes the shared default (t)", () => {
    expect(
      classifyCampaign(
        { ad_account_id: "acc-shared", campaign_id: "c5", campaign_name: "video mới nhất" },
        config
      )
    ).toEqual({ product_id: "prod-t", reason: "account_default" })
  })
})
