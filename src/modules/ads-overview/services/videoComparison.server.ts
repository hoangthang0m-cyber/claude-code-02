import { COLLECTIONS } from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { decryptSecret } from "@/lib/server/crypto"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { ReachCache } from "@/lib/server/meta/reportingInsights"

import type { Granularity } from "@/modules/ads-overview/services/productReport"
import {
  loadCurrencyRates,
  loadReportingCurrency,
} from "@/modules/ads-overview/services/reportingData.server"
import { requireReportingManager } from "@/modules/ads-overview/services/reportingScope.server"
import {
  resolveReportWindow,
  type ReportWindow,
} from "@/modules/ads-overview/services/reportWindow"
import {
  buildVideoComparison,
  buildVideoComparisonSeries,
  type VideoItemInput,
  type VideoSnapshotRow,
} from "@/modules/ads-overview/services/videoComparison"

// ads-overview-reporting change, group 6 (server). The video-comparison table:
// per content item, fold its ad-level snapshots into the 4 core metrics + the
// requested extras, over the chosen period. Manager only. Hard limit 6 items.

const MAX_ITEMS = 6
type Db = ReturnType<typeof getAdminDb>

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseItemIds(params: URLSearchParams): string[] {
  const raw = params.get("items") ?? params.get("content_item_ids") ?? ""
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))]
  if (ids.length === 0) throw new HttpError(400, "Cần ít nhất một hạng mục")
  if (ids.length > MAX_ITEMS) {
    throw new HttpError(400, `Tối đa ${MAX_ITEMS} video trong một bảng so sánh`)
  }
  return ids
}

// active ad-level bindings for one content item → the ad ids + accounts
async function bindingsFor(
  db: Db,
  contentItemId: string
): Promise<{ adIds: string[]; accounts: Set<string> }> {
  const snap = await db
    .collection(COLLECTIONS.adsBindings)
    .where("content_item_id", "==", contentItemId)
    .where("active", "==", true)
    .get()
  const adIds: string[] = []
  const accounts = new Set<string>()
  for (const d of snap.docs) {
    const b = d.data()
    if (b.object_level !== "ad") continue
    const adId = String(b.object_id ?? "")
    if (!adId) continue
    adIds.push(adId)
    accounts.add(String(b.ad_account_id ?? ""))
  }
  return { adIds: [...new Set(adIds)], accounts }
}

async function snapshotsForAds(
  db: Db,
  adIds: readonly string[],
  window: ReportWindow
): Promise<VideoSnapshotRow[]> {
  const rows: VideoSnapshotRow[] = []
  for (let i = 0; i < adIds.length; i += 30) {
    const snap = await db
      .collection(COLLECTIONS.adCreativeInsightSnapshots)
      .where("ad_id", "in", adIds.slice(i, i + 30))
      .where("stat_date", ">=", window.from)
      .where("stat_date", "<=", window.to)
      .get()
    for (const d of snap.docs) {
      const x = d.data()
      rows.push({
        ad_account_id: String(x.ad_account_id ?? ""),
        ad_id: String(x.ad_id ?? ""),
        stat_date: String(x.stat_date ?? ""),
        spend: num(x.spend),
        revenue: num(x.revenue),
        purchases: num(x.purchases),
        impressions: num(x.impressions),
        clicks: num(x.clicks),
        video_plays: num(x.video_plays),
        video_3s_plays: num(x.video_3s_plays),
        video_p100_plays: num(x.video_p100_plays),
        account_currency: String(x.account_currency ?? ""),
      })
    }
  }
  return rows
}

export interface VideoComparisonResult {
  window: { from: string; to: string; label: string }
  reporting_currency: string
  metrics_shown: string[]
  accounts_missing_rate: string[]
  items: Array<{
    content_item_id: string
    code: string
    status: "ok" | "pending" | "no_binding"
    metrics: Record<string, number | null>
    /** period-level, only when reach is requested; null on a fetch failure */
    reach: number | null
  }>
  series: {
    metric: string
    buckets: string[]
    lines: Array<{ content_item_id: string; code: string; values: (number | null)[] }>
  } | null
}

const EXTRA_METRICS = ["ctr", "reach", "purchases", "spend", "impressions"]

export async function getVideoComparison(
  actor: AuthedUser,
  params: URLSearchParams
): Promise<VideoComparisonResult> {
  requireReportingManager(actor)
  const db = getAdminDb()
  const ids = parseItemIds(params)
  const window = resolveReportWindow(params)
  const wantReach = (params.get("metrics") ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes("reach")
  const extrasShown = (params.get("metrics") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((m) => EXTRA_METRICS.includes(m))
  const bucketParam = params.get("bucket")
  const granularity: Granularity | null =
    bucketParam === "day" || bucketParam === "week" || bucketParam === "month"
      ? bucketParam
      : null
  const seriesMetric = params.get("series_metric") ?? "hook_rate"

  const [reportingCurrency, rates] = await Promise.all([
    loadReportingCurrency(db),
    loadCurrencyRates(db),
  ])

  // gather bindings + snapshots + code per item
  const inputs: Array<VideoItemInput & { accounts: Set<string>; adIds: string[] }> =
    []
  for (const id of ids) {
    const [{ adIds, accounts }, itemSnap] = await Promise.all([
      bindingsFor(db, id),
      db.collection(COLLECTIONS.contentItems).doc(id).get(),
    ])
    const code = String(itemSnap.data()?.code ?? id)
    const snapshots =
      adIds.length > 0 ? await snapshotsForAds(db, adIds, window) : []
    inputs.push({
      content_item_id: id,
      code,
      has_binding: adIds.length > 0,
      snapshots,
      accounts,
      adIds,
    })
  }

  const comparison = buildVideoComparison(inputs, rates, reportingCurrency)

  // reach — period-level, per (ad, window); cached
  const reachByItem = new Map<string, number | null>()
  if (wantReach) {
    const caches = new Map<string, ReachCache>()
    for (const acc of new Set(inputs.flatMap((i) => [...i.accounts]))) {
      const conn = await db
        .collection(COLLECTIONS.adAccountConnections)
        .where("ad_account_id", "==", acc)
        .limit(1)
        .get()
      if (conn.empty) continue
      try {
        caches.set(
          acc,
          new ReachCache(
            decryptSecret(String(conn.docs[0].data().token_encrypted ?? ""))
          )
        )
      } catch {
        /* unusable token — reach stays null for its ads */
      }
    }
    for (const item of inputs) {
      if (item.adIds.length === 0) {
        reachByItem.set(item.content_item_id, null)
        continue
      }
      let total = 0
      let ok = true
      for (const acc of item.accounts) {
        const cache = caches.get(acc)
        if (!cache) {
          ok = false
          break
        }
        for (const adId of item.adIds) {
          try {
            total += await cache.get(adId, window.from, window.to)
          } catch {
            ok = false
          }
        }
      }
      reachByItem.set(item.content_item_id, ok ? total : null)
    }
  }

  const pickMetrics = (m: {
    cost_per_purchase: number | null
    roas: number | null
    hook_rate: number | null
    retention_rate: number | null
    ctr: number | null
    purchases: number
    spend: number
    revenue: number
    impressions: number
  }): Record<string, number | null> => {
    const out: Record<string, number | null> = {
      cost_per_purchase: m.cost_per_purchase,
      roas: m.roas,
      hook_rate: m.hook_rate,
      retention_rate: m.retention_rate,
    }
    for (const e of extrasShown) {
      if (e === "reach") continue
      out[e] = (m as Record<string, number | null>)[e] ?? 0
    }
    return out
  }

  let series: VideoComparisonResult["series"] = null
  if (granularity) {
    const built = buildVideoComparisonSeries(
      inputs,
      rates,
      reportingCurrency,
      granularity
    )
    series = {
      metric: seriesMetric,
      buckets: built.buckets,
      lines: built.series.map((s) => ({
        content_item_id: s.content_item_id,
        code: s.code,
        values: s.points.map(
          (p) =>
            (p as unknown as Record<string, number | null>)[seriesMetric] ??
            null
        ),
      })),
    }
  }

  return {
    window: { from: window.from, to: window.to, label: window.label },
    reporting_currency: reportingCurrency,
    metrics_shown: [
      "cost_per_purchase",
      "roas",
      "hook_rate",
      "retention_rate",
      ...extrasShown,
    ],
    accounts_missing_rate: comparison.accounts_missing_rate,
    items: comparison.items.map((it) => ({
      content_item_id: it.content_item_id,
      code: it.code,
      status: it.status,
      metrics: pickMetrics(it.metrics),
      reach: wantReach ? (reachByItem.get(it.content_item_id) ?? null) : null,
    })),
    series,
  }
}

const METRIC_LABELS: Record<string, string> = {
  cost_per_purchase: "Chi phí / lượt mua",
  roas: "ROAS",
  hook_rate: "Tỷ lệ lôi cuốn",
  retention_rate: "Tỷ lệ giữ chân",
  ctr: "CTR",
  reach: "Reach",
  purchases: "Lượt mua",
  spend: "Chi phí",
  impressions: "Impressions",
}

// task 6.8: one row per video, the metrics currently shown.
export function videoComparisonCsv(result: VideoComparisonResult): string {
  const cols = result.metrics_shown
  const header = ["Mã", "Trạng thái", ...cols.map((c) => METRIC_LABELS[c] ?? c)]
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = result.items.map((it) => [
    it.code,
    it.status,
    ...cols.map((c) => {
      if (c === "reach") return it.reach ?? "—"
      const v = it.metrics[c]
      return v == null ? "—" : Math.round(v * 10000) / 10000
    }),
  ])
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n")
}
