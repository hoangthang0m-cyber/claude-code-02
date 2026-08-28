import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    connExists: true,
    connState: "connected" as string,
    actorRole: "manager" as "manager" | "staff" | null,
    setSpy: vi.fn(),
    updateSpy: vi.fn(),
    tokens: {
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3599,
      scope: "s1 s2",
    } as {
      access_token: string
      refresh_token?: string
      expires_in: number
      scope: string
    },
    refresh: { status: "ok", access_token: "fresh", expires_in: 3600 } as
      | { status: "ok"; access_token: string; expires_in: number }
      | { status: "revoked"; message: string },
    access: {
      can_read: true,
      can_write: true,
      spreadsheet_id: "1abc",
      spreadsheet_title: "Tiến độ",
      sheet_tab: "Nội dung",
      sheet_gid: 42,
    },
  },
}))

vi.mock("@/lib/server/crypto", () => ({
  encryptSecret: (s: string) => `enc(${s})`,
  decryptSecret: (s: string) => s.replace(/^enc\(([\s\S]*)\)$/, "$1"),
}))

vi.mock("@/lib/server/google/oauth", () => ({
  GOOGLE_OAUTH_SCOPES: ["scope-a"],
  googleConfigFromEnv: () => ({ clientId: "c", clientSecret: "s", redirectUri: "r" }),
  googleOAuthUrl: (_c: unknown, state: string) =>
    `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  exchangeCodeForTokens: vi.fn(async () => fx.tokens),
  refreshAccessToken: vi.fn(async () => fx.refresh),
  fetchGoogleEmail: vi.fn(async () => "m@hem.dev"),
}))
vi.mock("@/lib/server/google/sheets", () => ({
  verifySheetAccess: vi.fn(async () => fx.access),
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string) => query(name, [...clauses, f]),
    limit: () => query(name, clauses),
    get: async () => {
      if (name === "projectMembers" && clauses.includes("user_id")) {
        return fx.actorRole == null
          ? { empty: true, docs: [] }
          : { empty: false, docs: [{ data: () => ({ project_role: fx.actorRole }) }] }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: () => ({
          id: `${name}-1`,
          get: async () =>
            name === "googleConnections"
              ? {
                  exists: fx.connExists,
                  data: () => ({
                    user_id: "u-mgr",
                    email: "m@hem.dev",
                    scopes: ["scope-a"],
                    state: fx.connState,
                    refresh_token_encrypted: "enc(stored-rt)",
                    connected_at: { toMillis: () => 1_800_000_000_000 },
                  }),
                }
              : { exists: false },
          set: fx.setSpy,
          update: fx.updateSpy,
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { sealOAuthState } from "@/lib/server/oauthState"
import {
  beginGoogleConnect,
  completeGoogleConnect,
  getGoogleAccessToken,
  getGoogleConnection,
  verifyProjectSheet,
} from "@/modules/sheets-sync/services/googleConnection.server"

const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "u-staff", email: null, system_role: "staff" }

beforeEach(() => {
  process.env.TOKEN_ENC_KEY = "test-key"
  fx.connExists = true
  fx.connState = "connected"
  fx.actorRole = "manager"
  fx.setSpy.mockReset().mockResolvedValue(undefined)
  fx.updateSpy.mockReset().mockResolvedValue(undefined)
  fx.tokens = {
    access_token: "at",
    refresh_token: "rt",
    expires_in: 3599,
    scope: "s1 s2",
  }
  fx.refresh = { status: "ok", access_token: "fresh", expires_in: 3600 }
})

describe("beginGoogleConnect", () => {
  it("rejects a non-manager", () => {
    expect(() => beginGoogleConnect(staff, "r")).toThrow(/Trưởng phòng/)
  })
  it("returns a consent URL + nonce", () => {
    const { url, nonce } = beginGoogleConnect(mgr, "r")
    expect(url).toContain("accounts.google.com")
    expect(nonce).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe("completeGoogleConnect", () => {
  const nonce = "n".repeat(32)
  const sealed = () => sealOAuthState(mgr.uid, nonce)

  it("stores the encrypted refresh token + email, state connected", async () => {
    const { email } = await completeGoogleConnect({
      code: "c",
      sealedState: sealed(),
      stateNonce: nonce,
      redirectUri: "r",
    })
    expect(email).toBe("m@hem.dev")
    const written = fx.setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(written.state).toBe("connected")
    expect(written.refresh_token_encrypted).toBe("enc(rt)")
    expect(written).not.toHaveProperty("access_token")
  })

  it("errors when Google returns no refresh token", async () => {
    fx.tokens = { access_token: "at", expires_in: 60, scope: "" }
    await expect(
      completeGoogleConnect({ code: "c", sealedState: sealed(), stateNonce: nonce, redirectUri: "r" })
    ).rejects.toMatchObject({ status: 502 })
  })

  it("rejects a CSRF nonce mismatch", async () => {
    await expect(
      completeGoogleConnect({ code: "c", sealedState: sealed(), stateNonce: "x", redirectUri: "r" })
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("getGoogleConnection", () => {
  it("returns the view without the token", async () => {
    const { connection } = await getGoogleConnection(mgr)
    expect(connection).toEqual({
      email: "m@hem.dev",
      scopes: ["scope-a"],
      state: "connected",
      connected_at: 1_800_000_000_000,
    })
    expect(JSON.stringify(connection)).not.toContain("refresh_token")
  })

  it("null when the manager has not connected", async () => {
    fx.connExists = false
    expect((await getGoogleConnection(mgr)).connection).toBeNull()
  })
})

describe("getGoogleAccessToken", () => {
  it("refreshes and returns a fresh access token", async () => {
    expect(await getGoogleAccessToken("u-mgr")).toBe("fresh")
  })

  it("400 when there is no connection", async () => {
    fx.connExists = false
    await expect(getGoogleAccessToken("u-mgr")).rejects.toMatchObject({
      status: 400,
    })
  })

  it("flips to needs_reconnect when the refresh token was revoked", async () => {
    fx.refresh = { status: "revoked", message: "invalid_grant" }
    await expect(getGoogleAccessToken("u-mgr")).rejects.toMatchObject({
      status: 409,
    })
    expect(fx.updateSpy).toHaveBeenCalledWith({ state: "needs_reconnect" })
  })
})

describe("verifyProjectSheet", () => {
  it("403 for a non-manager of the project", async () => {
    fx.actorRole = "staff"
    await expect(
      verifyProjectSheet(mgr, "p1", "https://docs.google.com/spreadsheets/d/X/edit")
    ).rejects.toMatchObject({ status: 403 })
  })

  it("400 for a non-Sheets URL", async () => {
    await expect(
      verifyProjectSheet(mgr, "p1", "https://example.com/nope")
    ).rejects.toMatchObject({ status: 400 })
  })

  it("returns the resolved access check for a valid URL", async () => {
    const r = await verifyProjectSheet(
      mgr,
      "p1",
      "https://docs.google.com/spreadsheets/d/1abc/edit#gid=42"
    )
    expect(r).toMatchObject({
      can_read: true,
      can_write: true,
      sheet_tab: "Nội dung",
    })
  })
})
