import { FieldValue, Timestamp } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  type AdsDeliveryStatus,
  type ProjectLifecycle,
} from "@/lib/domain"
import { decryptSecret } from "@/lib/server/crypto"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import {
  fetchAdObjectInsights,
  fetchDeliveryStatus,
  type AdObjectInsights,
} from "@/lib/server/meta/insights"
import { aggregateMetrics } from "@/modules/ads-performance/services/metricsAggregate"

// SPEC §5.4 R3 / §6.4: the background job that pulls Meta Insights for every
// content item with an active AdsBinding and appends an AdsMetric
// (`source=synced`). Runs hourly from Vercel Cron; the per-item cadence is
// decided here from the project lifecycle and the last delivery status (Q5).

const HOUR = 3_600_000

// SPEC §6.4 / Q5: running + active → ≤ 6h; running + paused/completed → 12h
// ("giãn ra"); done → 24h; archived → not synced at all.
export function syncIntervalMs(
  lifecycle: ProjectLifecycle,
  lastStatus: AdsDeliveryStatus | null
): number {
  if (lifecycle === "done") return 24 * HOUR
  if (lastStatus === "active" || lastStatus == null) return 6 * HOUR
  return 12 * HOUR
}

export interface AdsSyncSummary {
  items_scanned: number
  synced: number
  skipped_not_due: number
  skipped_archived: number
  skipped_no_account: number
  object_errors: number
}

interface ConnLookup {
  token: string | null
  broken: boolean
}

export async function syncDueAdsMetrics(
  nowMs: number = Date.now()
): Promise<AdsSyncSummary> {
  const db = getAdminDb()

  const summary: AdsSyncSummary = {
    items_scanned: 0,
    synced: 0,
    skipped_not_due: 0,
    skipped_archived: 0,
    skipped_no_account: 0,
    object_errors: 0,
  }

  const bindingsSnap = await db
    .collection(COLLECTIONS.adsBindings)
    .where("active", "==", true)
    .get()

  // group active bindings by content item
  const byItem = new Map<string, Array<Record<string, unknown>>>()
  for (const d of bindingsSnap.docs) {
    const b = d.data()
    const key = String(b.content_item_id ?? "")
    if (!key) continue
    ;(byItem.get(key) ?? byItem.set(key, []).get(key)!).push(b)
  }
  summary.items_scanned = byItem.size

  // resolve an ad account connection once per account id
  const connCache = new Map<string, ConnLookup>()
  const resolveConn = async (adAccountId: string): Promise<ConnLookup> => {
    const cached = connCache.get(adAccountId)
    if (cached) return cached
    const snap = await db
      .collection(COLLECTIONS.adAccountConnections)
      .where("ad_account_id", "==", adAccountId)
      .limit(1)
      .get()
    let lookup: ConnLookup
    if (snap.empty || snap.docs[0].data().state === "needs_reconnect") {
      lookup = { token: null, broken: true }
    } else {
      try {
        lookup = {
          token: decryptSecret(String(snap.docs[0].data().token_encrypted ?? "")),
          broken: false,
        }
      } catch {
        lookup = { token: null, broken: true }
      }
    }
    connCache.set(adAccountId, lookup)
    return lookup
  }

  for (const [contentItemId, bindings] of byItem) {
    const itemSnap = await db
      .collection(COLLECTIONS.contentItems)
      .doc(contentItemId)
      .get()
    if (!itemSnap.exists) continue
    const projectId = String(itemSnap.data()?.project_id ?? "")

    const projSnap = await db
      .collection(COLLECTIONS.projects)
      .doc(projectId)
      .get()
    const lifecycle = (projSnap.data()?.lifecycle as ProjectLifecycle) ?? "running"
    if (lifecycle === "archived") {
      summary.skipped_archived++
      continue
    }

    // last synced metric → cadence + not-due check
    const metricsSnap = await db
      .collection(COLLECTIONS.adsMetrics)
      .where("content_item_id", "==", contentItemId)
      .get()
    let lastCapturedMs = 0
    let lastStatus: AdsDeliveryStatus | null = null
    for (const m of metricsSnap.docs) {
      const md = m.data()
      const cap = (md.captured_at as { toMillis?: () => number } | undefined)
      const capMs = typeof cap?.toMillis === "function" ? cap.toMillis() : 0
      if (md.source === "synced" && capMs > lastCapturedMs) {
        lastCapturedMs = capMs
        lastStatus = (md.delivery_status as AdsDeliveryStatus) ?? null
      }
    }
    if (
      lastCapturedMs > 0 &&
      nowMs - lastCapturedMs < syncIntervalMs(lifecycle, lastStatus)
    ) {
      summary.skipped_not_due++
      continue
    }

    // fetch each active binding on a working account
    const parts: Array<{
      insights: AdObjectInsights
      delivery_status: AdsDeliveryStatus
    }> = []
    for (const b of bindings) {
      const conn = await resolveConn(String(b.ad_account_id ?? ""))
      if (conn.broken || !conn.token) continue
      const objectId = String(b.object_id ?? "")
      try {
        const [insights, delivery_status] = await Promise.all([
          fetchAdObjectInsights(objectId, conn.token),
          fetchDeliveryStatus(objectId, conn.token),
        ])
        parts.push({ insights, delivery_status })
      } catch {
        summary.object_errors++
      }
    }

    if (parts.length === 0) {
      summary.skipped_no_account++
      continue
    }

    const agg = aggregateMetrics(parts)
    await db.collection(COLLECTIONS.adsMetrics).doc().set({
      content_item_id: contentItemId,
      source: "synced",
      spend: agg.spend,
      messages: agg.messages,
      cost_per_purchase: agg.cost_per_purchase,
      roas: agg.roas,
      ctr: agg.ctr,
      ads_started_on: agg.ads_started_on
        ? Timestamp.fromDate(new Date(agg.ads_started_on))
        : null,
      delivery_status: agg.delivery_status,
      data_as_of: Timestamp.fromMillis(nowMs),
      captured_at: FieldValue.serverTimestamp(),
    })
    summary.synced++
  }

  return summary
}
