import { randomBytes } from "node:crypto"

import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  parseSheetUrl,
  type GoogleConnectionView,
} from "@/lib/domain"
import {
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { decryptSecret, encryptSecret } from "@/lib/server/crypto"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import {
  GOOGLE_OAUTH_SCOPES,
  exchangeCodeForTokens,
  fetchGoogleEmail,
  googleConfigFromEnv,
  googleOAuthUrl,
  refreshAccessToken,
} from "@/lib/server/google/oauth"
import { verifySheetAccess, type SheetAccessCheck } from "@/lib/server/google/sheets"
import { HttpError } from "@/lib/server/http"
import { openOAuthState, sealOAuthState } from "@/lib/server/oauthState"

// SPEC §6.3, task 6.1: a manager connects their own Google account (OAuth, not a
// service account). The refresh token is stored AES-256-GCM encrypted in
// `googleConnections/{uid}` and never leaves the server.

function requireManager(actor: AuthedUser): void {
  if (actor.system_role !== "manager") {
    throw new HttpError(403, "Chỉ Trưởng phòng được kết nối Google")
  }
}

export function beginGoogleConnect(
  actor: AuthedUser,
  redirectUri: string
): { url: string; nonce: string } {
  requireManager(actor)
  const cfg = googleConfigFromEnv(redirectUri)
  const nonce = randomBytes(16).toString("hex")
  return {
    url: googleOAuthUrl(cfg, sealOAuthState(actor.uid, nonce)),
    nonce,
  }
}

export async function completeGoogleConnect(params: {
  code: string
  sealedState: string
  stateNonce: string | undefined
  redirectUri: string
}): Promise<{ email: string }> {
  if (!params.code) throw new HttpError(400, "Thiếu mã uỷ quyền từ Google")
  if (!params.stateNonce) throw new HttpError(400, "Thiếu cookie state OAuth")
  const uid = openOAuthState(params.sealedState, params.stateNonce)
  const cfg = googleConfigFromEnv(params.redirectUri)

  const tokens = await exchangeCodeForTokens(cfg, params.code)
  if (!tokens.refresh_token) {
    throw new HttpError(
      502,
      "Google không trả về refresh token — thử lại và chấp nhận quyền truy cập ngoại tuyến"
    )
  }
  const email = await fetchGoogleEmail(tokens.access_token)

  await getAdminDb()
    .collection(COLLECTIONS.googleConnections)
    .doc(uid)
    .set({
      user_id: uid,
      email,
      refresh_token_encrypted: encryptSecret(tokens.refresh_token),
      scopes: tokens.scope ? tokens.scope.split(" ") : GOOGLE_OAUTH_SCOPES,
      state: "connected",
      connected_at: FieldValue.serverTimestamp(),
    })
  return { email }
}

export async function getGoogleConnection(
  actor: AuthedUser
): Promise<{ connection: GoogleConnectionView | null }> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.googleConnections)
    .doc(actor.uid)
    .get()
  if (!snap.exists) return { connection: null }
  const d = snap.data() ?? {}
  const connectedAt = d.connected_at as { toMillis?: () => number } | undefined
  return {
    connection: {
      email: String(d.email ?? ""),
      scopes: Array.isArray(d.scopes) ? (d.scopes as string[]) : [],
      state: d.state === "needs_reconnect" ? "needs_reconnect" : "connected",
      connected_at:
        typeof connectedAt?.toMillis === "function"
          ? connectedAt.toMillis()
          : null,
    },
  }
}

// A fresh access token for `uid`'s Google connection. Flips the connection to
// `needs_reconnect` if the refresh token was revoked (SPEC §5.5 R4).
export async function getGoogleAccessToken(uid: string): Promise<string> {
  const db = getAdminDb()
  const ref = db.collection(COLLECTIONS.googleConnections).doc(uid)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpError(400, "Bạn chưa kết nối tài khoản Google")
  }
  const data = snap.data() ?? {}
  if (data.state === "needs_reconnect") {
    throw new HttpError(409, "Kết nối Google cần được cấp lại quyền")
  }

  const cfg = googleConfigFromEnv("")
  const refreshToken = decryptSecret(String(data.refresh_token_encrypted ?? ""))
  const result = await refreshAccessToken(cfg, refreshToken)
  if (result.status === "revoked") {
    await ref.update({ state: "needs_reconnect" })
    throw new HttpError(409, "Kết nối Google đã bị thu hồi — hãy kết nối lại")
  }
  return result.access_token
}

// SPEC §5.1 R1 / §5.5 R1: check the URL is a valid Sheet the acting manager can
// read and write, before any mapping is saved. Returns the resolved tab name
// (the URL only carries the numeric gid).
export async function verifyProjectSheet(
  actor: AuthedUser,
  projectId: string,
  url: string
): Promise<SheetAccessCheck> {
  const scope = await requireProjectScope(actor.uid, projectId)
  requireProjectManager(scope)

  const parsed = parseSheetUrl(url)
  if (!parsed) {
    throw new HttpError(400, "Link không phải Google Sheets hợp lệ")
  }

  const accessToken = await getGoogleAccessToken(actor.uid)
  return verifySheetAccess(
    accessToken,
    parsed.spreadsheet_id,
    parsed.sheet_gid
  )
}
