import { describe, expect, it, vi } from "vitest"

import {
  META_OAUTH_SCOPE,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  listAdAccounts,
  metaConfigFromEnv,
  metaOAuthDialogUrl,
  refreshLongLivedToken,
} from "@/lib/server/meta/graph"

const cfg = {
  appId: "app-1",
  appSecret: "secret-1",
  redirectUri: "https://x.test/api/ad-accounts/meta/callback",
}

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

describe("metaOAuthDialogUrl", () => {
  it("targets the Facebook dialog with scope + redirect + state", () => {
    const url = new URL(metaOAuthDialogUrl(cfg, "sealed-state"))
    expect(url.hostname).toBe("www.facebook.com")
    expect(url.pathname).toContain("/dialog/oauth")
    expect(url.searchParams.get("client_id")).toBe("app-1")
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri)
    expect(url.searchParams.get("state")).toBe("sealed-state")
    expect(url.searchParams.get("scope")).toBe(META_OAUTH_SCOPE)
    expect(url.searchParams.get("response_type")).toBe("code")
  })
})

describe("metaConfigFromEnv", () => {
  it("throws 500 when the app credentials are missing", () => {
    const old = { id: process.env.FACEBOOK_APP_ID, s: process.env.FACEBOOK_APP_SECRET }
    delete process.env.FACEBOOK_APP_ID
    delete process.env.FACEBOOK_APP_SECRET
    expect(() => metaConfigFromEnv("https://x.test/cb")).toThrow(/FACEBOOK_APP_ID/)
    if (old.id) process.env.FACEBOOK_APP_ID = old.id
    if (old.s) process.env.FACEBOOK_APP_SECRET = old.s
  })
})

describe("exchangeCodeForToken", () => {
  it("sends the code + client_secret and returns the short-lived token", async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      const url = new URL(u)
      expect(url.pathname).toContain("/oauth/access_token")
      expect(url.searchParams.get("code")).toBe("the-code")
      expect(url.searchParams.get("client_secret")).toBe("secret-1")
      return jsonRes({ access_token: "short-tok", expires_in: 3600 })
    })
    const t = await exchangeCodeForToken(cfg, "the-code", fetchImpl as never)
    expect(t).toEqual({ access_token: "short-tok", expires_in: 3600 })
  })

  it("throws 502 on a Graph error payload", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({ error: { message: "bad code" } }, false, 400)
    )
    await expect(
      exchangeCodeForToken(cfg, "x", fetchImpl as never)
    ).rejects.toMatchObject({ status: 502 })
  })
})

describe("exchangeForLongLivedToken", () => {
  it("uses grant_type=fb_exchange_token and defaults a missing expiry", async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      const url = new URL(u)
      expect(url.searchParams.get("grant_type")).toBe("fb_exchange_token")
      expect(url.searchParams.get("fb_exchange_token")).toBe("short-tok")
      return jsonRes({ access_token: "long-tok" })
    })
    const t = await exchangeForLongLivedToken(cfg, "short-tok", fetchImpl as never)
    expect(t.access_token).toBe("long-tok")
    expect(t.expires_in).toBe(60 * 24 * 60 * 60)
  })
})

describe("refreshLongLivedToken", () => {
  it("returns the renewed token on success", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({ access_token: "renewed", expires_in: 5_000_000 })
    )
    const r = await refreshLongLivedToken(cfg, "old-tok", fetchImpl as never)
    expect(r).toEqual({
      status: "refreshed",
      token: { access_token: "renewed", expires_in: 5_000_000 },
    })
  })

  it("classifies a dead token (code 190) as invalid, not an error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes(
        { error: { code: 190, type: "OAuthException", message: "expired" } },
        false,
        400
      )
    )
    const r = await refreshLongLivedToken(cfg, "dead", fetchImpl as never)
    expect(r.status).toBe("invalid")
  })

  it("treats any OAuthException as invalid", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({ error: { type: "OAuthException", message: "revoked" } }, false, 400)
    )
    expect((await refreshLongLivedToken(cfg, "x", fetchImpl as never)).status).toBe(
      "invalid"
    )
  })

  it("throws on a transient error (rate limit) so the next run retries", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({ error: { code: 4, message: "rate limited" } }, false, 429)
    )
    await expect(
      refreshLongLivedToken(cfg, "x", fetchImpl as never)
    ).rejects.toMatchObject({ status: 502 })
  })

  it("throws on a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET")
    })
    await expect(
      refreshLongLivedToken(cfg, "x", fetchImpl as never)
    ).rejects.toMatchObject({ status: 502 })
  })
})

describe("listAdAccounts", () => {
  it("maps account_id / name / id", async () => {
    const fetchImpl = vi.fn(async (u: string) => {
      expect(new URL(u).searchParams.get("access_token")).toBe("long-tok")
      return jsonRes({
        data: [
          { id: "act_111", account_id: "111", name: "Acme" },
          { account_id: "222", name: "Beta" },
        ],
      })
    })
    const accounts = await listAdAccounts("long-tok", fetchImpl as never)
    expect(accounts).toEqual([
      { id: "act_111", account_id: "111", name: "Acme" },
      { id: "act_222", account_id: "222", name: "Beta" },
    ])
  })

  it("returns [] when data is absent", async () => {
    const fetchImpl = vi.fn(async () => jsonRes({}))
    expect(await listAdAccounts("t", fetchImpl as never)).toEqual([])
  })
})
