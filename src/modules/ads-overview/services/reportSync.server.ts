import { FieldValue, Timestamp } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  adAccountReportSyncStateId,
  adCreativeInsightSnapshotId,
  adsInsightSnapshotId,
  type AdReportSyncScope,
} from "@/lib/domain"
import { decryptSecret } from "@/lib/server/crypto"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { MetaGraphError } from "@/lib/server/meta/errors"
import {
  fetchAdAccountCurrency,
  fetchAdInsights,
  fetchCampaignInsights,
  fetchCampaignStatuses,
} from "@/lib/server/meta/reportingInsights"

// ads-overview-reporting change, group 3 tasks 3.4–3.7. Background sync of
// Meta Insights into the daily snapshot collections.
//
// - campaign level: every connected account, window
//   [latest_synced_date - 7d, yesterday]; 90-day backfill on first connect;
//   a wide 28-day re-sync at most weekly (design.md Decision 4).
// - ad level: only ad ids that appear in an active ad-level AdsBinding; 90-day
//   backfill for the account when a binding is newer than the last full sync.
// - today is never snapshotted (3.7). Auth failure → the AdAccountConnection is
//   marked needs_reconnect and the account is skipped. Rate-limit / transient
//   failures are retried with backoff, then the run keeps the old snapshots and
//   records `last_result = warning` on the AdAccountReportSyncState.

type Fetch = typeof fetch
type Db = ReturnType<typeof getAdminDb>

const DAY = 86_400_000
const WEEK = 7 * DAY
const BATCH = 450

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)))

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
function parseIso(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}
function addDaysIso(iso: string, n: number): string {
  return isoDay(parseIso(iso) + n * DAY)
}
function minIso(a: string | null | undefined, b: string): string {
  return a && a < b ? a : b
}
function tsMs(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : null
}

// split [since, until] into calendar-month chunks so a 90-day backfill is a
// handful of bounded requests (design.md Decision 4: "chia theo tháng").
export function monthChunks(
  since: string,
  until: string
): Array<{ since: string; until: string }> {
  const out: Array<{ since: string; until: string }> = []
  let cur = since
  while (cur <= until) {
    const d = new Date(`${cur}T00:00:00Z`)
    const endOfMonth = isoDay(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
    )
    const chunkUntil = endOfMonth < until ? endOfMonth : until
    out.push({ since: cur, until: chunkUntil })
    cur = addDaysIso(chunkUntil, 1)
  }
  return out
}

export interface ReportSyncSummary {
  accounts_scanned: number
  accounts_synced: number
  accounts_skipped_reconnect: number
  accounts_disabled: number
  accounts_warning: number
  snapshots_written: number
  backfills: number
  retries: number
}

const emptySummary = (): ReportSyncSummary => ({
  accounts_scanned: 0,
  accounts_synced: 0,
  accounts_skipped_reconnect: 0,
  accounts_disabled: 0,
  accounts_warning: 0,
  snapshots_written: 0,
  backfills: 0,
  retries: 0,
})

interface SyncOptions {
  retryBaseMs?: number
  fetchImpl?: Fetch
}

async function withMetaRetry<T>(
  fn: () => Promise<T>,
  baseMs: number,
  onRetry: () => void
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (e instanceof MetaGraphError && !e.retryable) throw e
      if (attempt < 2) {
        onRetry()
        await sleep(baseMs * 2 ** attempt)
      }
    }
  }
  throw lastErr
}

async function writeSyncState(
  db: Db,
  adAccountId: string,
  scope: AdReportSyncScope,
  patch: Record<string, unknown>
): Promise<void> {
  await db
    .collection(COLLECTIONS.adAccountReportSyncStates)
    .doc(adAccountReportSyncStateId(adAccountId, scope))
    .set(
      {
        ad_account_id: adAccountId,
        scope,
        updated_at: FieldValue.serverTimestamp(),
        ...patch,
      },
      { merge: true }
    )
}

async function commitSnapshots(
  db: Db,
  collection: string,
  rows: Array<{ id: string; data: Record<string, unknown> }>
): Promise<number> {
  let written = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = db.batch()
    for (const r of rows.slice(i, i + BATCH)) {
      batch.set(db.collection(collection).doc(r.id), r.data)
      written++
    }
    await batch.commit()
  }
  return written
}

// ── 3.4 / 3.6 / 3.7 campaign snapshots ───────────────────────────────────

export async function syncCampaignSnapshots(
  nowMs: number = Date.now(),
  options: SyncOptions = {}
): Promise<ReportSyncSummary> {
  const db = getAdminDb()
  const retryBaseMs = options.retryBaseMs ?? 500
  const fetchImpl = options.fetchImpl ?? fetch
  const summary = emptySummary()
  const yesterday = isoDay(nowMs - DAY)

  const conns = await db.collection(COLLECTIONS.adAccountConnections).get()

  for (const conn of conns.docs) {
    summary.accounts_scanned++
    const data = conn.data()
    const accId = String(data.ad_account_id ?? "")
    if (!accId) continue
    if (data.state === "needs_reconnect") {
      summary.accounts_skipped_reconnect++
      continue
    }

    let token: string
    try {
      token = decryptSecret(String(data.token_encrypted ?? ""))
    } catch {
      summary.accounts_warning++
      await writeSyncState(db, accId, "campaign", {
        last_result: "error",
        message: "Token không giải mã được",
      })
      continue
    }

    const stateSnap = await db
      .collection(COLLECTIONS.adAccountReportSyncStates)
      .doc(adAccountReportSyncStateId(accId, "campaign"))
      .get()
    const state = stateSnap.data()

    let since: string
    let backfill = false
    let wide = false
    if (!state?.latest_synced_date) {
      since = addDaysIso(yesterday, -89)
      backfill = true
    } else {
      const lastFull = tsMs(state.last_full_sync_at)
      wide = lastFull == null || nowMs - lastFull > WEEK
      since = wide
        ? addDaysIso(yesterday, -27)
        : addDaysIso(String(state.latest_synced_date), -7)
    }
    if (since > yesterday) since = yesterday

    try {
      const [currency, statusById] = await Promise.all([
        withMetaRetry(
          () => fetchAdAccountCurrency(accId, token, fetchImpl),
          retryBaseMs,
          () => summary.retries++
        ),
        fetchCampaignStatuses(accId, token, fetchImpl).catch(
          () => new Map<string, string>()
        ),
      ])

      let wrote = 0
      for (const chunk of monthChunks(since, yesterday)) {
        const rows = await withMetaRetry(
          () =>
            fetchCampaignInsights(
              accId,
              token,
              chunk.since,
              chunk.until,
              fetchImpl
            ),
          retryBaseMs,
          () => summary.retries++
        )
        wrote += await commitSnapshots(
          db,
          COLLECTIONS.adsInsightSnapshots,
          rows
            .filter((r) => r.campaign_id && r.stat_date)
            .map((r) => ({
              id: adsInsightSnapshotId(accId, r.campaign_id, r.stat_date),
              data: {
                ad_account_id: accId,
                campaign_id: r.campaign_id,
                campaign_name: r.campaign_name,
                campaign_status: statusById.get(r.campaign_id) ?? "UNKNOWN",
                campaign_objective: r.objective,
                stat_date: r.stat_date,
                spend: r.spend,
                revenue: r.revenue,
                purchases: r.purchases,
                impressions: r.impressions,
                clicks: r.clicks,
                account_currency: currency,
                data_as_of: Timestamp.fromMillis(nowMs),
                synced_at: FieldValue.serverTimestamp(),
              },
            }))
        )
      }

      await writeSyncState(db, accId, "campaign", {
        earliest_synced_date: minIso(state?.earliest_synced_date as string, since),
        latest_synced_date: yesterday,
        last_result: "ok",
        message: null,
        ...(backfill || wide
          ? { last_full_sync_at: Timestamp.fromMillis(nowMs) }
          : {}),
      })
      summary.accounts_synced++
      summary.snapshots_written += wrote
      if (backfill) summary.backfills++
    } catch (e) {
      await handleAccountError(db, conn, accId, "campaign", e, summary)
    }
  }

  return summary
}

// ── 3.5 / 3.7 ad snapshots (only ad-level bindings) ──────────────────────

export async function syncAdSnapshots(
  nowMs: number = Date.now(),
  options: SyncOptions = {}
): Promise<ReportSyncSummary> {
  const db = getAdminDb()
  const retryBaseMs = options.retryBaseMs ?? 500
  const fetchImpl = options.fetchImpl ?? fetch
  const summary = emptySummary()
  const yesterday = isoDay(nowMs - DAY)

  const bindingsSnap = await db
    .collection(COLLECTIONS.adsBindings)
    .where("active", "==", true)
    .get()

  // ad id + newest binding time, per account
  const byAccount = new Map<
    string,
    { adIds: Set<string>; newestBindingMs: number }
  >()
  for (const d of bindingsSnap.docs) {
    const b = d.data()
    if (b.object_level !== "ad") continue
    const accId = String(b.ad_account_id ?? "")
    const adId = String(b.object_id ?? "")
    if (!accId || !adId) continue
    const entry =
      byAccount.get(accId) ?? { adIds: new Set<string>(), newestBindingMs: 0 }
    entry.adIds.add(adId)
    entry.newestBindingMs = Math.max(
      entry.newestBindingMs,
      tsMs(b.created_at) ?? 0
    )
    byAccount.set(accId, entry)
  }

  for (const [accId, entry] of byAccount) {
    summary.accounts_scanned++
    const connSnap = await db
      .collection(COLLECTIONS.adAccountConnections)
      .where("ad_account_id", "==", accId)
      .limit(1)
      .get()
    if (connSnap.empty) continue
    const conn = connSnap.docs[0]
    const data = conn.data()
    if (data.state === "needs_reconnect") {
      summary.accounts_skipped_reconnect++
      continue
    }

    let token: string
    try {
      token = decryptSecret(String(data.token_encrypted ?? ""))
    } catch {
      summary.accounts_warning++
      await writeSyncState(db, accId, "ad", {
        last_result: "error",
        message: "Token không giải mã được",
      })
      continue
    }

    const stateSnap = await db
      .collection(COLLECTIONS.adAccountReportSyncStates)
      .doc(adAccountReportSyncStateId(accId, "ad"))
      .get()
    const state = stateSnap.data()
    const lastFull = tsMs(state?.last_full_sync_at)
    const needBackfill =
      !state?.latest_synced_date ||
      lastFull == null ||
      entry.newestBindingMs > lastFull

    let since = needBackfill
      ? addDaysIso(yesterday, -89)
      : addDaysIso(String(state!.latest_synced_date), -7)
    if (since > yesterday) since = yesterday

    try {
      const currency = await withMetaRetry(
        () => fetchAdAccountCurrency(accId, token, fetchImpl),
        retryBaseMs,
        () => summary.retries++
      )
      const adIds = [...entry.adIds]
      let wrote = 0
      for (const chunk of monthChunks(since, yesterday)) {
        const rows = await withMetaRetry(
          () =>
            fetchAdInsights(
              accId,
              token,
              adIds,
              chunk.since,
              chunk.until,
              fetchImpl
            ),
          retryBaseMs,
          () => summary.retries++
        )
        wrote += await commitSnapshots(
          db,
          COLLECTIONS.adCreativeInsightSnapshots,
          rows
            .filter((r) => r.ad_id && r.stat_date)
            .map((r) => ({
              id: adCreativeInsightSnapshotId(accId, r.ad_id, r.stat_date),
              data: {
                ad_account_id: accId,
                campaign_id: r.campaign_id,
                ad_id: r.ad_id,
                ad_name: r.ad_name,
                stat_date: r.stat_date,
                spend: r.spend,
                revenue: r.revenue,
                purchases: r.purchases,
                impressions: r.impressions,
                clicks: r.clicks,
                video_plays: r.video_plays,
                video_3s_plays: r.video_3s_plays,
                video_p100_plays: r.video_p100_plays,
                account_currency: currency,
                data_as_of: Timestamp.fromMillis(nowMs),
                synced_at: FieldValue.serverTimestamp(),
              },
            }))
        )
      }

      await writeSyncState(db, accId, "ad", {
        earliest_synced_date: minIso(state?.earliest_synced_date as string, since),
        latest_synced_date: yesterday,
        last_result: "ok",
        message: null,
        last_full_sync_at: needBackfill
          ? Timestamp.fromMillis(nowMs)
          : (state?.last_full_sync_at ?? Timestamp.fromMillis(nowMs)),
      })
      summary.accounts_synced++
      summary.snapshots_written += wrote
      if (needBackfill) summary.backfills++
    } catch (e) {
      await handleAccountError(db, conn, accId, "ad", e, summary)
    }
  }

  return summary
}

async function handleAccountError(
  db: Db,
  conn: { ref: { update: (d: Record<string, unknown>) => Promise<unknown> } },
  accId: string,
  scope: AdReportSyncScope,
  error: unknown,
  summary: ReportSyncSummary
): Promise<void> {
  if (error instanceof MetaGraphError && error.kind === "auth") {
    await conn.ref.update({ state: "needs_reconnect" })
    await writeSyncState(db, accId, scope, {
      last_result: "error",
      message: error.message,
    })
    summary.accounts_disabled++
    return
  }
  // rate-limit / transient / anything else: keep the old snapshots
  await writeSyncState(db, accId, scope, {
    last_result: "warning",
    message: error instanceof Error ? error.message : "Đồng bộ thất bại",
  })
  summary.accounts_warning++
}
