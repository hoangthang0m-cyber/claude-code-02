import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import { idString } from "@/lib/domain/shared"

// ads-overview-reporting change, group 1 tasks 1.1 / 1.2. The product model and
// the campaign → product classification rules (design.md Decision 1 / 2).
//
// A campaign is never stamped with a product on the snapshot — classification
// is a pure function of these three records evaluated on read
// (see campaignClassify.ts), so editing a rule takes effect on the next report
// with no re-sync (spec "Thay đổi cấu hình ... có hiệu lực ngay").

// ── Product ────────────────────────────────────────────────────────────────

export interface Product {
  id: string
  /** one-letter tag matched as a token in campaign names */
  code: string
  name: string
  /** extra substrings that also identify the product, e.g. "hmdc" */
  keywords: string[]
  created_at: Timestamp
  updated_at: Timestamp
}

// The manager-editable portion. `code` is a single lowercase letter; keywords
// are normalised (lowercase, no diacritics) on write.
export const productWriteSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]$/, "Mã sản phẩm phải là một chữ cái"),
  name: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).default([]),
})

export type ProductWrite = z.infer<typeof productWriteSchema>

// Edit an existing product — `code` is the doc id, so only name / keywords
// move. No defaults here: an empty body must stay empty so the handler can
// reject "nothing to update".
export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
})

export type ProductUpdate = z.infer<typeof productUpdateSchema>

export interface ProductView {
  id: string
  code: string
  name: string
  keywords: string[]
}

// ── ProductAccountRule ─────────────────────────────────────────────────────

// Which product(s) an ad account runs. A single-product account has exactly one
// rule with `is_account_default = true`; a shared account has one rule per
// product and the default marks which product a code-less campaign name falls
// back to (design.md Decision 2).
export interface ProductAccountRule {
  id: string
  ad_account_id: string
  product_id: string
  is_account_default: boolean
  created_at: Timestamp
}

export const productAccountRuleWriteSchema = z.object({
  ad_account_id: idString,
  product_id: idString,
  is_account_default: z.boolean().default(false),
})

export type ProductAccountRuleWrite = z.infer<
  typeof productAccountRuleWriteSchema
>

export interface ProductAccountRuleView {
  id: string
  ad_account_id: string
  product_id: string
  is_account_default: boolean
}

// deterministic id → one rule per (account, product)
export function productAccountRuleId(
  adAccountId: string,
  productId: string
): string {
  return `${adAccountId}__${productId}`
}

// The config screen sets an account's whole product set at once (task 2.5):
// which products it runs, and which one a code-less campaign name defaults to.
// `default_product_id` null → the first of `product_ids`.
export const accountRulesSetSchema = z.object({
  ad_account_id: idString,
  product_ids: z.array(idString).min(1),
  default_product_id: idString.nullable().default(null),
})

export type AccountRulesSet = z.infer<typeof accountRulesSetSchema>

// ── CampaignProductOverride ────────────────────────────────────────────────

// A manual pin for one campaign, winning over every automatic rule
// (spec "Gán tay ghi đè").
export interface CampaignProductOverride {
  id: string
  ad_account_id: string
  campaign_id: string
  product_id: string
  set_by: string
  set_at: Timestamp
}

export const campaignProductOverrideWriteSchema = z.object({
  ad_account_id: idString,
  campaign_id: idString,
  product_id: idString,
})

export type CampaignProductOverrideWrite = z.infer<
  typeof campaignProductOverrideWriteSchema
>

// The config screen upserts or clears one manual pin (task 2.5). A null
// `product_id` removes the override.
export const campaignProductOverrideSetSchema = z.object({
  ad_account_id: idString,
  campaign_id: idString,
  product_id: idString.nullable(),
})

export type CampaignProductOverrideSet = z.infer<
  typeof campaignProductOverrideSetSchema
>

export interface CampaignProductOverrideView {
  id: string
  ad_account_id: string
  campaign_id: string
  product_id: string
}

// deterministic id → at most one override per (account, campaign)
export function campaignProductOverrideId(
  adAccountId: string,
  campaignId: string
): string {
  return `${adAccountId}__${campaignId}`
}
