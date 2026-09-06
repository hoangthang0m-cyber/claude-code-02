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

export interface ProductRow {
  id: string
  code: string
  name: string
}

export async function loadProducts(db: Db): Promise<ProductRow[]> {
  const snap = await db.collection(COLLECTIONS.products).get()
  return snap.docs
    .map((d) => ({
      id: d.id,
      code: String(d.data().code ?? d.id),
      name: String(d.data().name ?? d.id),
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

// task 4.5: "số liệu tính đến" + which accounts are stale / errored + how many
// of M accounts are actually in the merged total.
export interface ReportFreshness {
  data_through: string | null
  accounts_total: number
  accounts_merged: number
  accounts_delayed: Array<{
    ad_account_id: string
    name: string
    last_result: string
    message: string | null
  }>
  accounts_missing_rate: string[]
}

export async function loadFreshness(
  db: Db,
  accountsMissingRate: readonly string[]
): Promise<Omit<ReportFreshness, "accounts_missing_rate">> {
  const [conns, states] = await Promise.all([
    db.collection(COLLECTIONS.adAccountConnections).get(),
    db
      .collection(COLLECTIONS.adAccountReportSyncStates)
      .where("scope", "==", "campaign")
      .get(),
  ])

  const nameById = new Map<string, string>()
  for (const d of conns.docs) {
    nameById.set(
      String(d.data().ad_account_id ?? ""),
      String(d.data().name ?? "")
    )
  }

  let dataThrough: string | null = null
  const delayed: ReportFreshness["accounts_delayed"] = []
  for (const d of states.docs) {
    const x = d.data()
    const acct = String(x.ad_account_id ?? "")
    const latest = typeof x.latest_synced_date === "string" ? x.latest_synced_date : null
    if (latest && (dataThrough === null || latest > dataThrough)) {
      dataThrough = latest
    }
    if (x.last_result && x.last_result !== "ok") {
      delayed.push({
        ad_account_id: acct,
        name: nameById.get(acct) ?? acct,
        last_result: String(x.last_result),
        message: typeof x.message === "string" ? x.message : null,
      })
    }
  }

  const total = conns.size
  const dropped = new Set<string>([
    ...accountsMissingRate,
    ...delayed.map((d) => d.ad_account_id),
  ])
  return {
    data_through: dataThrough,
    accounts_total: total,
    accounts_merged: Math.max(0, total - dropped.size),
    accounts_delayed: delayed,
  }
}
