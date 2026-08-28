import type { AdsDeliveryStatus } from "@/lib/domain"
import type { AdObjectInsights } from "@/lib/server/meta/insights"

// SPEC §5.4 R2 / §6.4 — combining the Meta numbers of a content item's several
// ad bindings into one snapshot:
//
//   spend, messages, purchases   = Σ per binding
//   cost_per_purchase            = Σ spend / Σ purchases   (0 if no purchases)
//   roas                         = Σ(roasᵢ · spendᵢ) / Σ spend   (spend-weighted; 0 if Σ spend = 0)
//   ctr                          = Σ(ctrᵢ  · spendᵢ) / Σ spend   (spend-weighted; 0 if Σ spend = 0)
//   delivery_status              = active ▸ paused ▸ completed ▸ unknown (first present)
//   ads_started_on               = earliest non-null start date
//
// A single binding therefore passes straight through unchanged. Per-binding
// `cost_per_purchase` from Meta is intentionally ignored — CPP is always
// recomputed from the totals so it stays consistent with `spend` / `purchases`.

export interface AggregatedMetrics {
  spend: number
  messages: number
  purchases: number
  cost_per_purchase: number
  roas: number
  ctr: number
  delivery_status: AdsDeliveryStatus
  ads_started_on: string | null
}

// active shows through first, then paused, then completed (SPEC §5.4 R3).
const STATUS_PRECEDENCE: AdsDeliveryStatus[] = [
  "active",
  "paused",
  "completed",
  "unknown",
]

const ZERO: AggregatedMetrics = {
  spend: 0,
  messages: 0,
  purchases: 0,
  cost_per_purchase: 0,
  roas: 0,
  ctr: 0,
  delivery_status: "unknown",
  ads_started_on: null,
}

// Meta should never return negatives, but clamp defensively so one bad row
// can't drag a total below zero.
const nn = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0)

export function aggregateMetrics(
  parts: Array<{ insights: AdObjectInsights; delivery_status: AdsDeliveryStatus }>
): AggregatedMetrics {
  if (parts.length === 0) return { ...ZERO }

  const rows = parts.map((p) => ({
    spend: nn(p.insights.spend),
    messages: nn(p.insights.messages),
    purchases: nn(p.insights.purchases),
    roas: nn(p.insights.roas),
    ctr: nn(p.insights.ctr),
    delivery_status: p.delivery_status,
    ads_started_on: p.insights.ads_started_on,
  }))

  const spend = sum(rows, (r) => r.spend)
  const messages = sum(rows, (r) => r.messages)
  const purchases = sum(rows, (r) => r.purchases)

  const roas =
    spend > 0 ? sum(rows, (r) => r.roas * r.spend) / spend : 0
  const ctr = spend > 0 ? sum(rows, (r) => r.ctr * r.spend) / spend : 0

  const delivery_status =
    STATUS_PRECEDENCE.find((s) =>
      rows.some((r) => r.delivery_status === s)
    ) ?? "unknown"

  const ads_started_on =
    rows
      .map((r) => r.ads_started_on)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null

  return {
    spend,
    messages,
    purchases,
    cost_per_purchase: purchases > 0 ? spend / purchases : 0,
    roas,
    ctr,
    delivery_status,
    ads_started_on,
  }
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((n, item) => n + pick(item), 0)
}
