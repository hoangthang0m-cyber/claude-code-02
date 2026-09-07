import {
  classifyCampaign,
  convertCurrency,
  type ClassifyConfig,
  type CurrencyRateInput,
} from "@/lib/domain"

// ads-overview-reporting change, task 2.6. The "Chưa phân loại" row: campaigns
// whose ad account has no ProductAccountRule at all (design.md Decision 2 step
// 4). Pure so the numbers are unit-tested; the server just feeds it snapshots.

export interface UnclassifiedSnapshotRow {
  ad_account_id: string
  campaign_id: string
  campaign_name: string
  stat_date: string
  spend: number
  revenue: number
  account_currency: string
}

export interface UnclassifiedSummary {
  /** distinct unclassified campaigns seen in the window */
  campaign_count: number
  /** Σ spend in the reporting currency, excluding accounts with no FX rate */
  spend: number
  /** Σ revenue in the reporting currency, same exclusion */
  revenue: number
  /** ad accounts dropped from spend / revenue for lack of a currency rate */
  accounts_missing_rate: string[]
}

export function summarizeUnclassified(
  snapshots: readonly UnclassifiedSnapshotRow[],
  config: ClassifyConfig,
  rates: readonly CurrencyRateInput[],
  reportingCurrency: string
): UnclassifiedSummary {
  // group rows by campaign
  const groups = new Map<
    string,
    {
      ad_account_id: string
      campaign_id: string
      name: string
      rows: UnclassifiedSnapshotRow[]
    }
  >()
  for (const s of snapshots) {
    const key = JSON.stringify([s.ad_account_id, s.campaign_id])
    const g =
      groups.get(key) ??
      {
        ad_account_id: s.ad_account_id,
        campaign_id: s.campaign_id,
        name: s.campaign_name,
        rows: [],
      }
    if (s.campaign_name) g.name = s.campaign_name
    g.rows.push(s)
    groups.set(key, g)
  }

  let campaignCount = 0
  let spend = 0
  let revenue = 0
  const missing = new Set<string>()

  for (const g of groups.values()) {
    const result = classifyCampaign(
      {
        ad_account_id: g.ad_account_id,
        campaign_id: g.campaign_id,
        campaign_name: g.name,
      },
      config
    )
    if (result.product_id !== null) continue // classified — not our row

    campaignCount++
    for (const row of g.rows) {
      const s = convertCurrency(
        row.spend,
        row.account_currency,
        reportingCurrency,
        rates,
        row.stat_date
      )
      const r = convertCurrency(
        row.revenue,
        row.account_currency,
        reportingCurrency,
        rates,
        row.stat_date
      )
      if (!s.ok || !r.ok) {
        missing.add(row.ad_account_id)
        continue
      }
      spend += s.value
      revenue += r.value
    }
  }

  return {
    campaign_count: campaignCount,
    spend,
    revenue,
    accounts_missing_rate: [...missing].sort(),
  }
}
