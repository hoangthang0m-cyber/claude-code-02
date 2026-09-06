import {
  COLLECTIONS,
  DEFAULT_REPORTING_CURRENCY,
  REPORTING_SETTINGS_DOC_ID,
  type CurrencyRateInput,
} from "@/lib/domain"
import { getAdminDb } from "@/lib/server/firebaseAdmin"

import type { ReportWindow } from "@/modules/ads-overview/services/reportWindow"

// ads-overview-reporting change. Shared Firestore reads for the report + config
// endpoints (groups 2.6 / 4). Snapshots are server-only; every read here is
// behind requireReportingManager at the caller.

type Db = ReturnType<typeof getAdminDb>

export interface CampaignSnapshotRow {
  ad_account_id: string
  campaign_id: string
  campaign_name: string
  campaign_status: string
  campaign_objective: string
  stat_date: string
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
  account_currency: string
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function loadCampaignSnapshots(
  db: Db,
  window: ReportWindow
): Promise<CampaignSnapshotRow[]> {
  const snap = await db
    .collection(COLLECTIONS.adsInsightSnapshots)
    .where("stat_date", ">=", window.from)
    .where("stat_date", "<=", window.to)
    .get()
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      ad_account_id: String(x.ad_account_id ?? ""),
      campaign_id: String(x.campaign_id ?? ""),
      campaign_name: String(x.campaign_name ?? ""),
      campaign_status: String(x.campaign_status ?? ""),
      campaign_objective: String(x.campaign_objective ?? ""),
      stat_date: String(x.stat_date ?? ""),
      spend: num(x.spend),
      revenue: num(x.revenue),
      purchases: num(x.purchases),
      impressions: num(x.impressions),
      clicks: num(x.clicks),
      account_currency: String(x.account_currency ?? ""),
    }
  })
}

export async function loadCurrencyRates(db: Db): Promise<CurrencyRateInput[]> {
  const snap = await db.collection(COLLECTIONS.currencyRates).get()
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      from_currency: String(x.from_currency ?? ""),
      to_currency: String(x.to_currency ?? ""),
      rate: num(x.rate),
      effective_from: String(x.effective_from ?? ""),
    }
  })
}

export async function loadReportingCurrency(db: Db): Promise<string> {
  const snap = await db
    .collection(COLLECTIONS.reportingSettings)
    .doc(REPORTING_SETTINGS_DOC_ID)
    .get()
  const cur = snap.data()?.reporting_currency
  return typeof cur === "string" && cur ? cur : DEFAULT_REPORTING_CURRENCY
}
