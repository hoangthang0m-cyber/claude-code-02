import { randomBytes } from "node:crypto"

import { Timestamp } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  pickAdAccountSchema,
  type AdAccountConnectionView,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { encryptSecret } from "@/lib/server/crypto"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  listAdAccounts,
  metaConfigFromEnv,
  metaOAuthDialogUrl,
} from "@/lib/server/meta/graph"
import {
  openOAuthState,
  openPendingConnection,
  sealOAuthState,
  sealPendingConnection,
} from "@/lib/server/meta/oauth"
import { parseOrThrow } from "@/lib/server/validate"

// Meta Ad Account connect flow (SPEC §5.4 R1, §6.4). A connection belongs to the
// manager who ran the OAuth (`project_owner_id`), reusable across every project
// they manage. The long-lived token is stored AES-256-GCM encrypted and never
// leaves the server (firestore.rules denies all client access to the
// collection).

// Connecting an ad account is a manager-level action, not project-scoped.
function requireManager(actor: AuthedUser): void {
  if (actor.system_role !== "manager") {
    throw new HttpError(403, "Chỉ Trưởng phòng được kết nối tài khoản quảng cáo")
  }
}

export function connectionDocId(uid: string, adAccountId: string): string {
  return `${uid}__${adAccountId}`
}

// Step 1 — build the Facebook login URL. The route stores `nonce` in an
// httpOnly cookie for the double-submit CSRF check on the callback.
export function beginMetaConnect(
  actor: AuthedUser,
  redirectUri: string
): { url: string; nonce: string } {
  requireManager(actor)
  const cfg = metaConfigFromEnv(redirectUri)
  const nonce = randomBytes(16).toString("hex")
  const state = sealOAuthState(actor.uid, nonce)
  return { url: metaOAuthDialogUrl(cfg, state), nonce }
}

// Step 2 — the Facebook redirect lands here (no Bearer auth; the sealed state
// carries the manager's uid). Exchange the code for a long-lived token, list the
// ad accounts it can reach, and return a sealed blob for the pending cookie.
export async function completeMetaConnect(params: {
  code: string
  sealedState: string
  stateNonce: string | undefined
  redirectUri: string
}): Promise<{ sealedPending: string; accountCount: number }> {
  if (!params.code) {
    throw new HttpError(400, "Thiếu mã uỷ quyền từ Meta")
  }
  if (!params.stateNonce) {
    throw new HttpError(400, "Thiếu cookie state OAuth")
  }
  const uid = openOAuthState(params.sealedState, params.stateNonce)
  const cfg = metaConfigFromEnv(params.redirectUri)

  const short = await exchangeCodeForToken(cfg, params.code)
  if (!short.access_token) {
    throw new HttpError(502, "Meta không trả về access token")
  }
  const long = await exchangeForLongLivedToken(cfg, short.access_token)
  const token = long.access_token || short.access_token
  const accounts = await listAdAccounts(token)

  const sealedPending = sealPendingConnection({
    uid,
    token,
    token_expires_at: Date.now() + long.expires_in * 1000,
    accounts,
  })
  return { sealedPending, accountCount: accounts.length }
}

// Step 3a — the picker page reads the ad accounts from the pending cookie.
export function readPendingAccounts(
  actor: AuthedUser,
  sealedPending: string | undefined
): { accounts: Array<{ account_id: string; name: string }> } {
  requireManager(actor)
  const pending = openPendingConnection(sealedPending, actor.uid)
  return {
    accounts: pending.accounts.map((a) => ({
      account_id: a.account_id,
      name: a.name,
    })),
  }
}

// Step 3b — the manager picks one account; save the connection with the token
// from the pending cookie encrypted at rest, state `connected` (SPEC §5.4 R1).
export async function saveAdAccountConnection(
  actor: AuthedUser,
  body: unknown,
  sealedPending: string | undefined
): Promise<{ id: string }> {
  requireManager(actor)
  const pending = openPendingConnection(sealedPending, actor.uid)
  const input = parseOrThrow(pickAdAccountSchema, body)

  const match = pending.accounts.find(
    (a) => a.account_id === input.ad_account_id
  )
  if (!match) {
    throw new HttpError(400, "Tài khoản không nằm trong quyền vừa cấp")
  }

  const id = connectionDocId(actor.uid, input.ad_account_id)
  await getAdminDb()
    .collection(COLLECTIONS.adAccountConnections)
    .doc(id)
    .set({
      project_owner_id: actor.uid,
      ad_account_id: input.ad_account_id,
      name: input.name,
      token_encrypted: encryptSecret(pending.token),
      token_expires_at: Timestamp.fromMillis(pending.token_expires_at),
      state: "connected",
    })
  return { id }
}

// The manager's connections, token stripped (SPEC §1.5: never expose it).
export async function listAdAccountConnections(
  actor: AuthedUser
): Promise<{ connections: AdAccountConnectionView[] }> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.adAccountConnections)
    .where("project_owner_id", "==", actor.uid)
    .get()

  const connections = snap.docs.map((d) => {
    const data = d.data()
    const expires = data.token_expires_at as
      | { toMillis?: () => number }
      | undefined
    return {
      id: d.id,
      ad_account_id: String(data.ad_account_id ?? ""),
      name: String(data.name ?? ""),
      state: data.state === "needs_reconnect" ? "needs_reconnect" : "connected",
      token_expires_at:
        typeof expires?.toMillis === "function" ? expires.toMillis() : null,
    } satisfies AdAccountConnectionView
  })
  return { connections }
}
