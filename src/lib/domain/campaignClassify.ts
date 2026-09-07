// ads-overview-reporting change, group 2 tasks 2.1 / 2.2 / 2.3. Pure campaign →
// product classification (design.md Decision 2). Evaluated on every report read,
// so a rule change takes effect immediately with no re-sync.

// ── 2.1 String normalisation ──────────────────────────────────────────────

// lowercase, strip Vietnamese diacritics (and đ → d), collapse whitespace.
export function normalizeCampaignName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritics
    .toLowerCase()
    .replace(/đ/g, "d") // đ — does not decompose under NFD
    .trim()
    .replace(/\s+/g, " ")
}

// ── 2.2 Product-code token in a campaign name ─────────────────────────────

// One of a / t / h standing as its own token: a boundary before (start of
// string, whitespace, or "-") and, right after (optional whitespace allowed),
// one of "(", a digit, "/", or "-". Matches `t(20/8)`, `a - `, `h(16/8)`,
// `- t (5/9)`; does NOT match the `t` inside `thang` or `content`.
const PRODUCT_CODE_RE = /(?:^|[\s-])([ath])\s*[(/\d-]/

export function productCodeInName(normalizedName: string): string | null {
  const m = PRODUCT_CODE_RE.exec(normalizedName)
  return m ? m[1] : null
}

// ── 2.3 classify ─────────────────────────────────────────────────────────

export interface ClassifyProduct {
  id: string
  code: string
  keywords: readonly string[]
}

export interface ClassifyRule {
  ad_account_id: string
  product_id: string
  is_account_default: boolean
}

export interface ClassifyOverride {
  ad_account_id: string
  campaign_id: string
  product_id: string
}

export interface ClassifyConfig {
  products: readonly ClassifyProduct[]
  rules: readonly ClassifyRule[]
  overrides: readonly ClassifyOverride[]
}

export interface ClassifyInput {
  ad_account_id: string
  campaign_id: string
  campaign_name: string
}

export type ClassifyReason =
  | "override"
  | "keyword"
  | "code"
  | "account_default"
  | "unconfigured_account"

export interface ClassifyResult {
  /** null → "Chưa phân loại" */
  product_id: string | null
  reason: ClassifyReason
}

export function classifyCampaign(
  input: ClassifyInput,
  config: ClassifyConfig
): ClassifyResult {
  // 1. manual pin wins
  const override = config.overrides.find(
    (o) =>
      o.ad_account_id === input.ad_account_id &&
      o.campaign_id === input.campaign_id
  )
  if (override) return { product_id: override.product_id, reason: "override" }

  // 2. code / keyword in the (normalised) campaign name
  const name = normalizeCampaignName(input.campaign_name)
  for (const p of config.products) {
    for (const kw of p.keywords) {
      const k = normalizeCampaignName(kw)
      if (k && name.includes(k)) {
        return { product_id: p.id, reason: "keyword" }
      }
    }
  }
  const code = productCodeInName(name)
  if (code) {
    const p = config.products.find((x) => x.code.toLowerCase() === code)
    if (p) return { product_id: p.id, reason: "code" }
  }

  // 3. the account's default product
  const accountRules = config.rules.filter(
    (r) => r.ad_account_id === input.ad_account_id
  )
  if (accountRules.length > 0) {
    const def =
      accountRules.find((r) => r.is_account_default) ??
      (accountRules.length === 1 ? accountRules[0] : undefined)
    if (def) return { product_id: def.product_id, reason: "account_default" }
  }

  // 4. account not mapped to any product
  return { product_id: null, reason: "unconfigured_account" }
}
