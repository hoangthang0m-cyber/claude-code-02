import { HttpError } from "@/lib/server/http"

// Thin Meta Graph API client for the Ad Account OAuth connect flow (SPEC §5.4
// R1, §6.4). Only what task 5.1 needs: the OAuth dialog URL, the code → token
// exchanges, and listing the ad accounts a token can reach. Insights fetching
// lands in task 5.4.

export const META_GRAPH_VERSION = "v21.0"
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`
const DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`

// Read-only access to ad accounts + insights (SPEC §5.4 R1).
export const META_OAUTH_SCOPE = "ads_read"

export interface MetaAppConfig {
  appId: string
  appSecret: string
  redirectUri: string
}

export interface MetaToken {
  access_token: string
  /** seconds from now; Meta long-lived user tokens last ~60 days. */
  expires_in: number
}

export interface MetaAdAccount {
  /** the `act_<id>` form used by the Graph API */
  id: string
  /** the bare numeric id */
  account_id: string
  name: string
}

type Fetch = typeof fetch

export function metaConfigFromEnv(redirectUri: string): MetaAppConfig {
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET
  if (!appId || !appSecret) {
    throw new HttpError(
      500,
      "Thiếu FACEBOOK_APP_ID / FACEBOOK_APP_SECRET trên server"
    )
  }
  return { appId, appSecret, redirectUri }
}

// The Facebook login dialog the manager is sent to. `state` is our sealed
// anti-forgery token (see meta/oauth.ts).
export function metaOAuthDialogUrl(cfg: MetaAppConfig, state: string): string {
  const url = new URL(DIALOG)
  url.searchParams.set("client_id", cfg.appId)
  url.searchParams.set("redirect_uri", cfg.redirectUri)
  url.searchParams.set("state", state)
  url.searchParams.set("scope", META_OAUTH_SCOPE)
  url.searchParams.set("response_type", "code")
  return url.toString()
}

async function graphJson(
  fetchImpl: Fetch,
  url: string,
  context: string
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetchImpl(url, { cache: "no-store" })
  } catch {
    throw new HttpError(502, `Không gọi được Meta Graph API (${context})`)
  }
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!json) {
    throw new HttpError(502, `Meta Graph API trả về không hợp lệ (${context})`)
  }
  if (!res.ok || json.error) {
    const message =
      (json.error as { message?: string } | undefined)?.message ??
      `HTTP ${res.status}`
    throw new HttpError(502, `Meta OAuth thất bại (${context}): ${message}`)
  }
  return json
}

// Step 1: authorization code → short-lived user token.
export async function exchangeCodeForToken(
  cfg: MetaAppConfig,
  code: string,
  fetchImpl: Fetch = fetch
): Promise<MetaToken> {
  const url = new URL(`${GRAPH}/oauth/access_token`)
  url.searchParams.set("client_id", cfg.appId)
  url.searchParams.set("client_secret", cfg.appSecret)
  url.searchParams.set("redirect_uri", cfg.redirectUri)
  url.searchParams.set("code", code)
  const json = await graphJson(fetchImpl, url.toString(), "đổi mã")
  return {
    access_token: String(json.access_token ?? ""),
    expires_in: Number(json.expires_in ?? 0),
  }
}

// Step 2: short-lived token → long-lived user token (~60 days).
export async function exchangeForLongLivedToken(
  cfg: MetaAppConfig,
  shortToken: string,
  fetchImpl: Fetch = fetch
): Promise<MetaToken> {
  const url = new URL(`${GRAPH}/oauth/access_token`)
  url.searchParams.set("grant_type", "fb_exchange_token")
  url.searchParams.set("client_id", cfg.appId)
  url.searchParams.set("client_secret", cfg.appSecret)
  url.searchParams.set("fb_exchange_token", shortToken)
  const json = await graphJson(fetchImpl, url.toString(), "token dài hạn")
  return {
    access_token: String(json.access_token ?? ""),
    // Meta sometimes omits expires_in for long-lived tokens; default 60 days.
    expires_in: Number(json.expires_in ?? 60 * 24 * 60 * 60),
  }
}

export type TokenRefreshResult =
  | { status: "refreshed"; token: MetaToken }
  | { status: "invalid"; message: string }

// SPEC §5.4 R1 / §6.4: renew a long-lived user token before it expires by
// re-running the fb_exchange_token grant. A still-valid token comes back
// extended; a revoked/expired one returns an OAuthException (code 190) → the
// caller marks the connection `needs_reconnect`. Transient failures (network,
// rate limit, 5xx) throw so the next cron run retries.
export async function refreshLongLivedToken(
  cfg: MetaAppConfig,
  currentToken: string,
  fetchImpl: Fetch = fetch
): Promise<TokenRefreshResult> {
  const url = new URL(`${GRAPH}/oauth/access_token`)
  url.searchParams.set("grant_type", "fb_exchange_token")
  url.searchParams.set("client_id", cfg.appId)
  url.searchParams.set("client_secret", cfg.appSecret)
  url.searchParams.set("fb_exchange_token", currentToken)

  let res: Response
  try {
    res = await fetchImpl(url.toString(), { cache: "no-store" })
  } catch {
    throw new HttpError(502, "Không gọi được Meta để làm mới token")
  }
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (json && typeof json.access_token === "string") {
    return {
      status: "refreshed",
      token: {
        access_token: json.access_token,
        expires_in: Number(json.expires_in ?? 60 * 24 * 60 * 60),
      },
    }
  }

  const error = (json?.error ?? {}) as {
    code?: number
    type?: string
    message?: string
  }
  // A dead token — the manager must reconnect (SPEC §5.4 R1).
  if (error.code === 190 || error.type === "OAuthException") {
    return { status: "invalid", message: error.message ?? "Token không hợp lệ" }
  }
  // Anything else is transient.
  throw new HttpError(
    502,
    `Làm mới token thất bại: ${error.message ?? `HTTP ${res.status}`}`
  )
}

// Step 3: the ad accounts this token can read (SPEC §5.4 R1: "chọn một Ad
// Account").
export async function listAdAccounts(
  token: string,
  fetchImpl: Fetch = fetch
): Promise<MetaAdAccount[]> {
  const url = new URL(`${GRAPH}/me/adaccounts`)
  url.searchParams.set("fields", "account_id,name")
  url.searchParams.set("limit", "200")
  url.searchParams.set("access_token", token)
  const json = await graphJson(fetchImpl, url.toString(), "danh sách tài khoản")
  const data = Array.isArray(json.data) ? json.data : []
  return data.map((row) => {
    const r = row as Record<string, unknown>
    const accountId = String(r.account_id ?? "")
    return {
      id: String(r.id ?? `act_${accountId}`),
      account_id: accountId,
      name: String(r.name ?? accountId),
    }
  })
}
