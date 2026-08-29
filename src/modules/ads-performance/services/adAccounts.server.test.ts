import { randomBytes } from "node:crypto"

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    setSpy: vi.fn(),
    connectionDocs: [] as Array<Record<string, unknown>>,
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminAuth: () => ({}),
  getAdminDb: () => ({
    collection: () => ({
      doc: (id: string) => ({ id, set: fx.setSpy }),
      where: () => ({
        get: async () => ({
          docs: fx.connectionDocs.map((d, i) => ({
            id: `conn${i}`,
            data: () => d,
          })),
        }),
      }),
    }),
  }),
}))

import type { AuthedUser } from "@/lib/server/auth"
import { decryptSecret } from "@/lib/server/crypto"
import { sealOAuthState, sealPendingConnection } from "@/lib/server/meta/oauth"
import {
  beginMetaConnect,
  completeMetaConnect,
  connectionDocId,
  listAdAccountConnections,
  readPendingAccounts,
  saveAdAccountConnection,
} from "@/modules/ads-performance/services/adAccounts.server"

const manager: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "u-staff", email: null, system_role: "staff" }

beforeAll(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")
  process.env.FACEBOOK_APP_ID = "app-1"
  process.env.FACEBOOK_APP_SECRET = "secret-1"
})

beforeEach(() => {
  fx.setSpy.mockReset().mockResolvedValue(undefined)
  fx.connectionDocs = []
})

describe("beginMetaConnect", () => {
  it("rejects a non-manager (403)", () => {
    expect(() => beginMetaConnect(staff, "https://x.test/cb")).toThrow(
      /Trưởng phòng/
    )
  })

  it("returns a Facebook dialog URL and a nonce for the manager", () => {
    const { url, nonce } = beginMetaConnect(manager, "https://x.test/cb")
    expect(url).toContain("www.facebook.com")
    expect(url).toContain("dialog/oauth")
    expect(nonce).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe("completeMetaConnect (mocked Graph API)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        const url = new URL(u)
        const body =
          url.pathname.endsWith("/me/adaccounts")
            ? { data: [{ id: "act_123", account_id: "123", name: "Acme Ads" }] }
            : url.searchParams.get("grant_type") === "fb_exchange_token"
              ? { access_token: "LONG-LIVED", expires_in: 5_184_000 }
              : { access_token: "short", expires_in: 3600 }
        return { ok: true, status: 200, json: async () => body } as Response
      })
    )
  })

  it("exchanges the code for a long-lived token and seals the pending accounts", async () => {
    const nonce = "n".repeat(32)
    const sealedState = sealOAuthState(manager.uid, nonce)
    const { sealedPending, accountCount } = await completeMetaConnect({
      code: "auth-code",
      sealedState,
      stateNonce: nonce,
      redirectUri: "https://x.test/cb",
    })
    expect(accountCount).toBe(1)
    const pending = readPendingAccounts(manager, sealedPending)
    expect(pending.accounts).toEqual([{ account_id: "123", name: "Acme Ads" }])
  })

  it("rejects a state nonce mismatch (CSRF, 400)", async () => {
    const sealedState = sealOAuthState(manager.uid, "a".repeat(32))
    await expect(
      completeMetaConnect({
        code: "c",
        sealedState,
        stateNonce: "b".repeat(32),
        redirectUri: "https://x.test/cb",
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects a missing code (400)", async () => {
    await expect(
      completeMetaConnect({
        code: "",
        sealedState: "x",
        stateNonce: "y",
        redirectUri: "https://x.test/cb",
      })
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("readPendingAccounts", () => {
  it("rejects a pending blob that belongs to another user (403)", () => {
    const sealed = sealPendingConnection({
      uid: "someone-else",
      token: "t",
      token_expires_at: Date.now() + 1000,
      accounts: [],
    })
    expect(() => readPendingAccounts(manager, sealed)).toThrow(/thuộc về bạn/)
  })
})

describe("saveAdAccountConnection", () => {
  const pending = () =>
    sealPendingConnection({
      uid: manager.uid,
      token: "LONG-LIVED-TOKEN",
      token_expires_at: Date.now() + 60 * 24 * 60 * 60 * 1000,
      accounts: [{ id: "act_123", account_id: "123", name: "Acme Ads" }],
    })

  it("writes a connection with the encrypted token and state connected", async () => {
    const res = await saveAdAccountConnection(
      manager,
      { ad_account_id: "123", name: "Acme Ads" },
      pending()
    )
    expect(res.id).toBe(connectionDocId(manager.uid, "123"))

    const written = fx.setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(written.project_owner_id).toBe(manager.uid)
    expect(written.ad_account_id).toBe("123")
    expect(written.state).toBe("connected")
    expect(written.token_encrypted).not.toContain("LONG-LIVED-TOKEN")
    expect(decryptSecret(written.token_encrypted as string)).toBe(
      "LONG-LIVED-TOKEN"
    )
    expect(written.token_expires_at).toBeDefined()
  })

  it("rejects an account outside the granted list (400)", async () => {
    await expect(
      saveAdAccountConnection(
        manager,
        { ad_account_id: "999", name: "Rogue" },
        pending()
      )
    ).rejects.toMatchObject({ status: 400 })
    expect(fx.setSpy).not.toHaveBeenCalled()
  })

  it("rejects a non-manager (403)", async () => {
    await expect(
      saveAdAccountConnection(
        staff,
        { ad_account_id: "123", name: "Acme Ads" },
        pending()
      )
    ).rejects.toMatchObject({ status: 403 })
  })

  it("rejects a missing pending cookie (400)", async () => {
    await expect(
      saveAdAccountConnection(
        manager,
        { ad_account_id: "123", name: "Acme Ads" },
        undefined
      )
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("listAdAccountConnections", () => {
  it("returns the view without the token", async () => {
    fx.connectionDocs = [
      {
        project_owner_id: manager.uid,
        ad_account_id: "123",
        name: "Acme Ads",
        token_encrypted: "iv:tag:cipher",
        token_expires_at: { toMillis: () => 1_900_000_000_000 },
        state: "connected",
      },
    ]
    const { connections } = await listAdAccountConnections(manager)
    expect(connections).toEqual([
      {
        id: "conn0",
        ad_account_id: "123",
        name: "Acme Ads",
        state: "connected",
        token_expires_at: 1_900_000_000_000,
      },
    ])
    expect(JSON.stringify(connections)).not.toContain("token_encrypted")
  })
})
