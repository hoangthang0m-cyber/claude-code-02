import type { CookieOptions } from "@/lib/server/cookies"
import { decryptSecret, encryptSecret } from "@/lib/server/crypto"
import { HttpError } from "@/lib/server/http"
import type { MetaAdAccount } from "@/lib/server/meta/graph"

// State carried through the Meta OAuth round-trip. Both blobs are AES-256-GCM
// sealed with TOKEN_ENC_KEY, so the browser (and Meta) cannot read or forge
// them. The state also travels back with a plaintext nonce cookie for the
// standard double-submit CSRF check.

export const META_STATE_COOKIE = "meta_oauth_state"
export const META_PENDING_COOKIE = "meta_oauth_pending"

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes to finish the Facebook dialog
const PENDING_TTL_S = 10 * 60 // 10 minutes to pick an account

export const pendingCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax",
  path: "/",
  maxAge: PENDING_TTL_S,
}

interface StatePayload {
  uid: string
  nonce: string
  ts: number
}

export function sealOAuthState(uid: string, nonce: string): string {
  const payload: StatePayload = { uid, nonce, ts: Date.now() }
  return encryptSecret(JSON.stringify(payload))
}

export function openOAuthState(sealed: string, expectedNonce: string): string {
  let payload: StatePayload
  try {
    payload = JSON.parse(decryptSecret(sealed)) as StatePayload
  } catch {
    throw new HttpError(400, "State OAuth không hợp lệ")
  }
  if (payload.nonce !== expectedNonce) {
    throw new HttpError(400, "State OAuth không khớp (CSRF)")
  }
  if (!payload.ts || Date.now() - payload.ts > STATE_TTL_MS) {
    throw new HttpError(400, "Phiên OAuth đã hết hạn — thử kết nối lại")
  }
  return payload.uid
}

export interface PendingConnection {
  uid: string
  /** long-lived user token */
  token: string
  /** absolute epoch ms */
  token_expires_at: number
  accounts: MetaAdAccount[]
}

export function sealPendingConnection(pending: PendingConnection): string {
  return encryptSecret(JSON.stringify(pending))
}

export function openPendingConnection(
  sealed: string | undefined,
  actorUid: string
): PendingConnection {
  if (!sealed) {
    throw new HttpError(400, "Chưa có phiên kết nối Meta đang chờ")
  }
  let pending: PendingConnection
  try {
    pending = JSON.parse(decryptSecret(sealed)) as PendingConnection
  } catch {
    throw new HttpError(400, "Phiên kết nối Meta không hợp lệ")
  }
  if (pending.uid !== actorUid) {
    throw new HttpError(403, "Phiên kết nối Meta không thuộc về bạn")
  }
  return pending
}
