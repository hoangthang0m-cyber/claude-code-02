import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"

import { loadClassifyConfig } from "@/modules/ads-overview/services/productConfig.server"
import {
  loadCampaignSnapshots,
  loadCurrencyRates,
  loadReportingCurrency,
} from "@/modules/ads-overview/services/reportingData.server"
import { requireReportingManager } from "@/modules/ads-overview/services/reportingScope.server"
import { resolveReportWindow } from "@/modules/ads-overview/services/reportWindow"
import {
  summarizeUnclassified,
  type UnclassifiedSummary,
} from "@/modules/ads-overview/services/unclassifiedGroup"

// ads-overview-reporting change, task 2.6. The "Chưa phân loại" row for a
// window: campaign count + spend + revenue for campaigns whose ad account has
// no ProductAccountRule (design.md Decision 2 step 4). Manager only.

export interface UnclassifiedGroupResult extends UnclassifiedSummary {
  window: { from: string; to: string; label: string }
  reporting_currency: string
}

export async function getUnclassifiedGroup(
  actor: AuthedUser,
  params: URLSearchParams
): Promise<UnclassifiedGroupResult> {
  requireReportingManager(actor)
  const window = resolveReportWindow(params)
  const db = getAdminDb()

  const [snapshots, config, rates, reportingCurrency] = await Promise.all([
    loadCampaignSnapshots(db, window),
    loadClassifyConfig(db),
    loadCurrencyRates(db),
    loadReportingCurrency(db),
  ])

  const summary = summarizeUnclassified(
    snapshots,
    config,
    rates,
    reportingCurrency
  )

  return {
    ...summary,
    window: { from: window.from, to: window.to, label: window.label },
    reporting_currency: reportingCurrency,
  }
}
