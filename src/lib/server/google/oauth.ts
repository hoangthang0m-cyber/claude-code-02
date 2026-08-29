import { HttpError } from "@/lib/server/http"

// Google OAuth 2.0 for the Sheets sync (SPEC §6.3: the manager's own token, not
// a service account). Task 6.1 needs the connect flow, the code→token exchange
// and the refresh-token → access-token exchange.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

// Read+write the sheets the manager can access, read file metadata (for the
// `canEdit` capability check), and identify the account.
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "openid",
  "email",
]

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function googleConfigFromEnv(redirectUri: string): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new HttpError(
      500,
      "Thiếu GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET trên server"
    )
  }
  return { clientId, clientSecret, redirectUri }
}

// `access_type=offline` + `prompt=consent` → Google returns a refresh_token
// every time, not just on the first consent.
export function googleOAuthUrl(cfg: GoogleOAuthConfig, state: string): string {
  const url = new URL(AUTH_URL)
  url.searchParams.set("client_id", cfg.clientId)
  url.searchParams.set("redirect_uri", cfg.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "))
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "consent")
  url.searchParams.set("include_granted_scopes", "true")
  url.searchParams.set("state", state)
  return url.toString()
}

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
}

type Fetch = typeof fetch

async function tokenRequest(
  fetchImpl: Fetch,
  params: Record<string, string>,
  context: string
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      cache: "no-store",
    })
  } catch {
    throw new HttpError(502, `Không gọi được Google (${context})`)
  }
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!json) throw new HttpError(502, `Google trả về không hợp lệ (${context})`)
  if (!res.ok || json.error) {
    const msg =
      (json.error_description as string) ??
      (json.error as string) ??
      `HTTP ${res.status}`
    throw new HttpError(502, `Google OAuth thất bại (${context}): ${msg}`)
  }
  return json
}

export async function exchangeCodeForTokens(
  cfg: GoogleOAuthConfig,
  code: string,
  fetchImpl: Fetch = fetch
): Promise<GoogleTokens> {
  const json = await tokenRequest(
    fetchImpl,
    {
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    },
    "đổi mã"
  )
  return {
    access_token: String(json.access_token ?? ""),
    refresh_token: json.refresh_token ? String(json.refresh_token) : undefined,
    expires_in: Number(json.expires_in ?? 3600),
    scope: String(json.scope ?? ""),
  }
}

// SPEC §5.5 R4: a refresh that returns invalid_grant means the manager revoked
// access — the caller flips the connection to needs_reconnect.
export type AccessTokenResult =
  | { status: "ok"; access_token: string; expires_in: number }
  | { status: "revoked"; message: string }

export async function refreshAccessToken(
  cfg: GoogleOAuthConfig,
  refreshToken: string,
  fetchImpl: Fetch = fetch
): Promise<AccessTokenResult> {
  let res: Response
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "refresh_token",
      }).toString(),
      cache: "no-store",
    })
  } catch {
    throw new HttpError(502, "Không gọi được Google để làm mới token")
  }
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (json && typeof json.access_token === "string") {
    return {
      status: "ok",
      access_token: json.access_token,
      expires_in: Number(json.expires_in ?? 3600),
    }
  }
  const err = String(json?.error ?? `HTTP ${res.status}`)
  if (err === "invalid_grant" || err === "invalid_client") {
    return { status: "revoked", message: err }
  }
  throw new HttpError(502, `Làm mới token Google thất bại: ${err}`)
}

export async function fetchGoogleEmail(
  accessToken: string,
  fetchImpl: Fetch = fetch
): Promise<string> {
  let res: Response
  try {
    res = await fetchImpl(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
  } catch {
    throw new HttpError(502, "Không lấy được thông tin tài khoản Google")
  }
  const json = (await res.json().catch(() => null)) as { email?: string } | null
  return json?.email ?? ""
}
