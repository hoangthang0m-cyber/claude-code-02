import {
  FieldValue,
  Timestamp,
  type DocumentReference,
} from "firebase-admin/firestore"

import {
  COLLECTIONS,
  type AdsDeliveryStatus,
  type ProjectLifecycle,
} from "@/lib/domain"
import { decryptSecret } from "@/lib/server/crypto"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { MetaGraphError } from "@/lib/server/meta/errors"
import {
  fetchAdObjectInsights,
  fetchDeliveryStatus,
  type AdObjectInsights,
} from "@/lib/server/meta/insights"
import { aggregateMetrics } from "@/modules/ads-performance/services/metricsAggregate"
import {
  projectManagerUids,
  queueNotification,
} from "@/modules/notifications/services/notify.server"

// SPEC §5.4 R3 / §6.4: the background job that pulls Meta Insights for every
// content item with an active AdsBinding and appends an AdsMetric
// (`source=synced`). Runs hourly from Vercel Cron; the per-item cadence is
// decided here from the project lifecycle and the last delivery status (Q5).
//
// Error handling (SPEC §5.4 R3, task 5.6): rate-limit / network / 5xx errors are
// retried with exponential backoff; a persistent failure keeps the last
// AdsMetric untouched and stamps `AdsBinding.sync_error_since` so an alert can
// fire only after > 24h. A dead token (auth error) marks the
// AdAccountConnection `needs_reconnect` and stops syncing that account.
//
// Delivery changes (SPEC §5.4 R3 / §5.7 R1, task 5.7): when the item's combined
// delivery goes active → paused/completed, an `ads_stopped` notification is
// queued for the project managers in the same batch as the AdsMetric write.

const HOUR = 3_600_000
const STALE_ALERT_MS = 24 * HOUR

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
  retries: number
  accounts_disabled: number
  bindings_erroring: number
  bindings_stale_over_24h: number
  ads_stopped_events: number
}

export interface AdsSyncOptions {
  /** base backoff between retries; 3 attempts total (base, 2·base, 4·base). */
  retryBaseMs?: number
}

interface ConnLookup {
  ref: DocumentReference | null
  token: string | null
  broken: boolean
}

const sleep = (ms: number) =>
  new Promise((r) => setTimeout(r, Math.max(0, ms)))

export async function syncDueAdsMetrics(
  nowMs: number = Date.now(),
  options: AdsSyncOptions = {}
): Promise<AdsSyncSummary> {
  const db = getAdminDb()
  const retryBaseMs = options.retryBaseMs ?? 500

  const summary: AdsSyncSummary = {
    items_scanned: 0,
    synced: 0,
    skipped_not_due: 0,
    skipped_archived: 0,
    skipped_no_account: 0,
    object_errors: 0,
    retries: 0,
    accounts_disabled: 0,
    bindings_erroring: 0,
    bindings_stale_over_24h: 0,
    ads_stopped_events: 0,
  }

  const bindingsSnap = await db
    .collection(COLLECTIONS.adsBindings)
    .where("active", "==", true)
    .get()

  // group active bindings by content item (keep the ref so we can stamp
  // sync_error_since)
  const byItem = new Map<
    string,
    Array<{ ref: DocumentReference; data: Record<string, unknown> }>
  >()
  for (const d of bindingsSnap.docs) {
    const data = d.data()
    const key = String(data.content_item_id ?? "")
    if (!key) continue
    ;(byItem.get(key) ?? byItem.set(key, []).get(key)!).push({
      ref: d.ref,
      data,
    })
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
      lookup = { ref: null, token: null, broken: true }
    } else {
      try {
        lookup = {
          ref: snap.docs[0].ref,
          token: decryptSecret(
            String(snap.docs[0].data().token_encrypted ?? "")
          ),
          broken: false,
        }
      } catch {
        lookup = { ref: snap.docs[0].ref, token: null, broken: true }
      }
    }
    connCache.set(adAccountId, lookup)
    return lookup
  }

  // SPEC §5.4 R1 / §6.4: a dead token stops the whole account.
  const disableAccount = async (adAccountId: string, conn: ConnLookup) => {
    if (conn.ref) {
      await conn.ref.update({ state: "needs_reconnect" })
      summary.accounts_disabled++
    }
    connCache.set(adAccountId, { ref: conn.ref, token: null, broken: true })
  }

  // retry rate-limit / transient errors; give up on auth / fatal immediately.
  const fetchObject = async (
    objectId: string,
    token: string
  ): Promise<{
    insights: AdObjectInsights
    delivery_status: AdsDeliveryStatus
  }> => {
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [insights, delivery_status] = await Promise.all([
          fetchAdObjectInsights(objectId, token),
          fetchDeliveryStatus(objectId, token),
        ])
        return { insights, delivery_status }
      } catch (e) {
        lastErr = e
        if (e instanceof MetaGraphError && !e.retryable) throw e
        if (attempt < 2) {
          summary.retries++
          await sleep(retryBaseMs * 2 ** attempt)
        }
      }
    }
    throw lastErr
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
    const lifecycle =
      (projSnap.data()?.lifecycle as ProjectLifecycle) ?? "running"
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
      const cap = md.captured_at as { toMillis?: () => number } | undefined
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
      const adAccountId = String(b.data.ad_account_id ?? "")
      const conn = await resolveConn(adAccountId)
      if (conn.broken || !conn.token) continue

      const objectId = String(b.data.object_id ?? "")
      try {
        parts.push(await fetchObject(objectId, conn.token))
        // recovered — clear any error marker (SPEC §5.4 R3)
        if (b.data.sync_error_since) {
          await b.ref.update({ sync_error_since: null })
        }
      } catch (e) {
        if (e instanceof MetaGraphError && e.kind === "auth") {
          await disableAccount(adAccountId, conn)
          continue
        }
        // SPEC §5.4 R3: keep the last data, remember since when it's failing.
        summary.object_errors++
        summary.bindings_erroring++
        const since = tsMs(b.data.sync_error_since)
        if (since == null) {
          await b.ref.update({ sync_error_since: Timestamp.fromMillis(nowMs) })
        } else if (nowMs - since > STALE_ALERT_MS) {
          summary.bindings_stale_over_24h++
        }
      }
    }

    if (parts.length === 0) {
      summary.skipped_no_account++
      continue
    }

    const agg = aggregateMetrics(parts)
    const batch = db.batch()
    batch.set(db.collection(COLLECTIONS.adsMetrics).doc(), {
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

    // SPEC §5.4 R3 / §5.7 R1: the item's ads went from running to stopped —
    // notify the project managers ("ads đã dừng").
    const stopped =
      lastStatus === "active" &&
      (agg.delivery_status === "paused" || agg.delivery_status === "completed")
    if (stopped) {
      const code = String(itemSnap.data()?.code ?? contentItemId)
      for (const uid of await projectManagerUids(db, projectId)) {
        queueNotification(db, batch, {
          recipient_id: uid,
          type: "ads_stopped",
          content_item_id: contentItemId,
          project_id: projectId,
          message: `Ads của hạng mục ${code} đã ${
            agg.delivery_status === "paused" ? "tạm dừng" : "hoàn tất"
          }`,
        })
      }
      summary.ads_stopped_events++
    }

    await batch.commit()
    summary.synced++
  }

  return summary
}

function tsMs(value: unknown): number | null {
  const t = value as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : null
}
