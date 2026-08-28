import type { CookieOptions } from "@/lib/server/cookies"
import { decryptSecret, encryptSecret } from "@/lib/server/crypto"
import { HttpError } from "@/lib/server/http"
import type { MetaAdAccount } from "@/lib/server/meta/graph"

export { openOAuthState, sealOAuthState } from "@/lib/server/oauthState"

// Meta-specific pieces of the OAuth round-trip. The generic sealed `state`
// helpers live in src/lib/server/oauthState.ts.

export const META_STATE_COOKIE = "meta_oauth_state"
export const META_PENDING_COOKIE = "meta_oauth_pending"

const PENDING_TTL_S = 10 * 60 // 10 minutes to pick an account

export const pendingCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax",
  path: "/",
  maxAge: PENDING_TTL_S,
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
