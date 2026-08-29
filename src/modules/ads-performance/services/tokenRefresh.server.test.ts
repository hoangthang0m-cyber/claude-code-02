import { randomBytes } from "node:crypto"

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

interface Conn {
  id: string
  state: string
  token_encrypted: string
  token_expires_at: { toMillis: () => number }
  update: ReturnType<typeof vi.fn>
}

const { fx } = vi.hoisted(() => ({
  fx: { conns: [] as unknown[] },
}))

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminAuth: () => ({}),
  getAdminDb: () => ({
    collection: () => ({
      get: async () => ({
        size: fx.conns.length,
        docs: (fx.conns as Conn[]).map((c) => ({
          data: () => c,
          ref: { update: c.update },
        })),
      }),
    }),
  }),
}))

import { decryptSecret, encryptSecret } from "@/lib/server/crypto"
import { refreshExpiringTokens } from "@/modules/ads-performance/services/tokenRefresh.server"

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const ts = (ms: number) => ({ toMillis: () => ms })

let stub: ReturnType<typeof vi.fn>

beforeAll(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")
  process.env.FACEBOOK_APP_ID = "app-1"
  process.env.FACEBOOK_APP_SECRET = "secret-1"
})

beforeEach(() => {
  stub = vi.fn(async () =>
    jsonRes({ access_token: "renewed-token", expires_in: 60 * DAY / 1000 })
  )
  vi.stubGlobal("fetch", stub)
  fx.conns = []
})

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

function conn(over: Partial<Conn> = {}): Conn {
  return {
    id: "c1",
    state: "connected",
    token_encrypted: encryptSecret("current-token"),
    token_expires_at: ts(NOW + 3 * DAY), // inside the 7-day window
    update: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe("refreshExpiringTokens (SPEC §5.4 R1, §6.4, task 5.2)", () => {
  it("renews a token that is close to expiry", async () => {
    const c = conn()
    fx.conns = [c]
    const summary = await refreshExpiringTokens(NOW)

    expect(summary).toMatchObject({ refreshed: 1, needs_reconnect: 0 })
    const patch = c.update.mock.calls[0][0] as Record<string, unknown>
    expect(decryptSecret(patch.token_encrypted as string)).toBe("renewed-token")
    expect(
      (patch.token_expires_at as { toMillis: () => number }).toMillis()
    ).toBeGreaterThan(NOW + 30 * DAY)
  })

  it("marks a connection needs_reconnect when the token is dead, keeps the token", async () => {
    stub.mockResolvedValue(
      jsonRes({ error: { code: 190, type: "OAuthException" } }, false, 400)
    )
    const c = conn()
    fx.conns = [c]
    const summary = await refreshExpiringTokens(NOW)

    expect(summary).toMatchObject({ refreshed: 0, needs_reconnect: 1 })
    expect(c.update).toHaveBeenCalledWith({ state: "needs_reconnect" })
  })

  it("skips a connection that is already needs_reconnect", async () => {
    const c = conn({ state: "needs_reconnect" })
    fx.conns = [c]
    const summary = await refreshExpiringTokens(NOW)

    expect(summary).toMatchObject({ skipped: 1, refreshed: 0 })
    expect(c.update).not.toHaveBeenCalled()
    expect(stub).not.toHaveBeenCalled()
  })

  it("skips a connection whose token is not due yet", async () => {
    const c = conn({ token_expires_at: ts(NOW + 40 * DAY) })
    fx.conns = [c]
    const summary = await refreshExpiringTokens(NOW)

    expect(summary).toMatchObject({ skipped: 1, refreshed: 0 })
    expect(c.update).not.toHaveBeenCalled()
  })

  it("leaves the connection alone on a transient error", async () => {
    stub.mockRejectedValue(new Error("network"))
    const c = conn()
    fx.conns = [c]
    const summary = await refreshExpiringTokens(NOW)

    expect(summary).toMatchObject({
      transient_errors: 1,
      refreshed: 0,
      needs_reconnect: 0,
    })
    expect(c.update).not.toHaveBeenCalled()
  })

  it("marks needs_reconnect when the stored token cannot be decrypted", async () => {
    const c = conn({ token_encrypted: "garbage" })
    fx.conns = [c]
    const summary = await refreshExpiringTokens(NOW)

    expect(summary).toMatchObject({ needs_reconnect: 1 })
    expect(c.update).toHaveBeenCalledWith({ state: "needs_reconnect" })
    expect(stub).not.toHaveBeenCalled()
  })

  it("processes a mixed batch", async () => {
    let call = 0
    stub.mockImplementation(async () => {
      call++
      return call === 1
        ? jsonRes({ access_token: "new1", expires_in: 60 * DAY / 1000 })
        : jsonRes({ error: { type: "OAuthException" } }, false, 400)
    })
    fx.conns = [
      conn({ id: "due-ok" }),
      conn({ id: "due-dead" }),
      conn({ id: "not-due", token_expires_at: ts(NOW + 30 * DAY) }),
      conn({ id: "already-broken", state: "needs_reconnect" }),
    ]
    const summary = await refreshExpiringTokens(NOW)
    expect(summary).toEqual({
      scanned: 4,
      refreshed: 1,
      needs_reconnect: 1,
      skipped: 2,
      transient_errors: 0,
    })
  })
})
