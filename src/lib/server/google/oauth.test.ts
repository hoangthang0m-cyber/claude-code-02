import { describe, expect, it, vi } from "vitest"

import {
  GOOGLE_OAUTH_SCOPES,
  exchangeCodeForTokens,
  fetchGoogleEmail,
  googleConfigFromEnv,
  googleOAuthUrl,
  refreshAccessToken,
} from "@/lib/server/google/oauth"

const cfg = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "https://x.test/api/google/connect/callback",
}
const jsonRes = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response

describe("googleOAuthUrl", () => {
  it("requests offline access + consent so a refresh token always comes back", () => {
    const url = new URL(googleOAuthUrl(cfg, "sealed"))
    expect(url.hostname).toBe("accounts.google.com")
    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(url.searchParams.get("prompt")).toBe("consent")
    expect(url.searchParams.get("state")).toBe("sealed")
    expect(url.searchParams.get("scope")).toBe(GOOGLE_OAUTH_SCOPES.join(" "))
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri)
  })
})

describe("googleConfigFromEnv", () => {
  it("throws 500 without the client credentials", () => {
    const old = {
      id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      s: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    }
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
    expect(() => googleConfigFromEnv("x")).toThrow(/GOOGLE_OAUTH_CLIENT_ID/)
    if (old.id) process.env.GOOGLE_OAUTH_CLIENT_ID = old.id
    if (old.s) process.env.GOOGLE_OAUTH_CLIENT_SECRET = old.s
  })
})

describe("exchangeCodeForTokens", () => {
  it("returns the access + refresh tokens", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      expect(String(init.body)).toContain("grant_type=authorization_code")
      return jsonRes({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3599,
        scope: "a b",
      })
    })
    const t = await exchangeCodeForTokens(cfg, "the-code", f as never)
    expect(t).toEqual({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3599,
      scope: "a b",
    })
  })

  it("throws 502 on a Google error", async () => {
    const f = vi.fn(async () =>
      jsonRes({ error: "invalid_grant", error_description: "bad" }, false, 400)
    )
    await expect(
      exchangeCodeForTokens(cfg, "x", f as never)
    ).rejects.toMatchObject({ status: 502 })
  })
})

describe("refreshAccessToken", () => {
  it("returns a fresh access token", async () => {
    const f = vi.fn(async () => jsonRes({ access_token: "new", expires_in: 3600 }))
    expect(await refreshAccessToken(cfg, "rt", f as never)).toEqual({
      status: "ok",
      access_token: "new",
      expires_in: 3600,
    })
  })

  it("reports invalid_grant as revoked, not an error", async () => {
    const f = vi.fn(async () => jsonRes({ error: "invalid_grant" }, false, 400))
    expect((await refreshAccessToken(cfg, "rt", f as never)).status).toBe(
      "revoked"
    )
  })

  it("throws on any other failure", async () => {
    const f = vi.fn(async () => jsonRes({ error: "server_error" }, false, 500))
    await expect(
      refreshAccessToken(cfg, "rt", f as never)
    ).rejects.toMatchObject({ status: 502 })
  })
})

describe("fetchGoogleEmail", () => {
  it("reads the email from userinfo", async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer at"
      )
      return jsonRes({ email: "m@hem.dev" })
    })
    expect(await fetchGoogleEmail("at", f as never)).toBe("m@hem.dev")
  })
})
