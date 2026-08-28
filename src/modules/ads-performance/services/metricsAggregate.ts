import type { AdsDeliveryStatus } from "@/lib/domain"
import type { AdObjectInsights } from "@/lib/server/meta/insights"

// SPEC §5.4 R2, §6.4: a content item can be bound to several ad objects; their
// numbers are combined into one snapshot. Sums for spend / messages / purchases;
// cost_per_purchase from the totals; roas / ctr re-weighted by spend. Task 5.5
// hardens this with the full WHEN/THEN scenarios.

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

export function aggregateMetrics(
  parts: Array<{ insights: AdObjectInsights; delivery_status: AdsDeliveryStatus }>
): AggregatedMetrics {
  if (parts.length === 0) {
    return {
      spend: 0,
      messages: 0,
      purchases: 0,
      cost_per_purchase: 0,
      roas: 0,
      ctr: 0,
      delivery_status: "unknown",
      ads_started_on: null,
    }
  }

  const spend = sum(parts, (p) => p.insights.spend)
  const messages = sum(parts, (p) => p.insights.messages)
  const purchases = sum(parts, (p) => p.insights.purchases)

  const weightedRoas =
    spend > 0
      ? sum(parts, (p) => p.insights.roas * p.insights.spend) / spend
      : 0
  const weightedCtr =
    spend > 0 ? sum(parts, (p) => p.insights.ctr * p.insights.spend) / spend : 0

  const status =
    STATUS_PRECEDENCE.find((s) =>
      parts.some((p) => p.delivery_status === s)
    ) ?? "unknown"

  const startDates = parts
    .map((p) => p.insights.ads_started_on)
    .filter((d): d is string => Boolean(d))
    .sort()

  return {
    spend,
    messages,
    purchases,
    cost_per_purchase: purchases > 0 ? spend / purchases : 0,
    roas: weightedRoas,
    ctr: weightedCtr,
    delivery_status: status,
    ads_started_on: startDates[0] ?? null,
  }
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((n, item) => n + pick(item), 0)
}
