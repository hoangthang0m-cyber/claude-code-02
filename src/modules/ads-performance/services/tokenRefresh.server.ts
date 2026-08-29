import { Timestamp } from "firebase-admin/firestore"

import { COLLECTIONS, isAdAccountSyncable } from "@/lib/domain"
import { decryptSecret, encryptSecret } from "@/lib/server/crypto"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { metaConfigFromEnv, refreshLongLivedToken } from "@/lib/server/meta/graph"

// SPEC §5.4 R1 / §6.4: the background job that renews Meta long-lived tokens
// before they expire, and flips a connection to `needs_reconnect` (stopping its
// sync) when the token is dead. Runs from a Vercel Cron → /api/jobs/…, or by
// hand with the CRON_SECRET.

// Renew a token once it is within a week of expiry — long-lived tokens last
// ~60 days, so a daily job has ample margin.
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface TokenRefreshSummary {
  scanned: number
  refreshed: number
  needs_reconnect: number
  skipped: number
  transient_errors: number
}

function expiresAtMs(value: unknown): number {
  const t = value as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : 0
}

export async function refreshExpiringTokens(
  nowMs: number = Date.now()
): Promise<TokenRefreshSummary> {
  const db = getAdminDb()
  const snap = await db.collection(COLLECTIONS.adAccountConnections).get()

  const summary: TokenRefreshSummary = {
    scanned: snap.size,
    refreshed: 0,
    needs_reconnect: 0,
    skipped: 0,
    transient_errors: 0,
  }

  // Config is resolved once; if the app credentials are missing this throws and
  // the whole job 500s (an operator problem, not a per-connection one).
  const cfg = metaConfigFromEnv("")

  for (const doc of snap.docs) {
    const data = doc.data()
    const state = data.state === "needs_reconnect" ? "needs_reconnect" : "connected"

    // Already broken, or not due yet.
    if (
      !isAdAccountSyncable(state) ||
      expiresAtMs(data.token_expires_at) - nowMs > REFRESH_WINDOW_MS
    ) {
      summary.skipped++
      continue
    }

    let currentToken: string
    try {
      currentToken = decryptSecret(String(data.token_encrypted ?? ""))
    } catch {
      // Unreadable ciphertext — treat as a dead connection.
      await doc.ref.update({ state: "needs_reconnect" })
      summary.needs_reconnect++
      continue
    }

    let result
    try {
      result = await refreshLongLivedToken(cfg, currentToken)
    } catch {
      // Network / rate limit / 5xx — leave the connection alone, retry next run.
      summary.transient_errors++
      continue
    }

    if (result.status === "invalid") {
      await doc.ref.update({ state: "needs_reconnect" })
      summary.needs_reconnect++
      continue
    }

    await doc.ref.update({
      token_encrypted: encryptSecret(result.token.access_token),
      token_expires_at: Timestamp.fromMillis(
        nowMs + result.token.expires_in * 1000
      ),
    })
    summary.refreshed++
  }

  return summary
}
