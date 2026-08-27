import { beforeEach, describe, expect, it, vi } from "vitest"

const { verifyIdToken, userDocGet, getAdminAuth, getAdminDb } = vi.hoisted(() => {
  const verifyIdToken = vi.fn()
  const userDocGet = vi.fn()
  return {
    verifyIdToken,
    userDocGet,
    getAdminAuth: vi.fn(() => ({ verifyIdToken })),
    getAdminDb: vi.fn(() => ({
      collection: () => ({ doc: () => ({ get: userDocGet }) }),
    })),
  }
})

vi.mock("@/lib/server/firebaseAdmin", () => ({ getAdminAuth, getAdminDb }))

import { getAuthedUser } from "@/lib/server/auth"

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://app.local/api/me", { headers })
}

beforeEach(() => {
  verifyIdToken.mockReset()
  userDocGet.mockReset()
  getAdminAuth.mockReset().mockReturnValue({ verifyIdToken })
  getAdminDb.mockReset().mockReturnValue({
    collection: () => ({ doc: () => ({ get: userDocGet }) }),
  })
})

describe("getAuthedUser (SPEC §7.1 task 1.4)", () => {
  it("rejects a request with no Authorization header (401)", async () => {
    await expect(getAuthedUser(request())).rejects.toMatchObject({ status: 401 })
  })

  it("rejects a non-Bearer Authorization header (401)", async () => {
    await expect(
      getAuthedUser(request({ authorization: "Basic Zm9vOmJhcg==" }))
    ).rejects.toMatchObject({ status: 401 })
  })

  it("rejects an invalid / expired token (401)", async () => {
    verifyIdToken.mockRejectedValue(new Error("token used too late"))
    await expect(
      getAuthedUser(request({ authorization: "Bearer stale" }))
    ).rejects.toMatchObject({ status: 401 })
  })

  it("resolves uid, email and system_role from the users doc", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u1", email: "manager@hemtarot.vn" })
    userDocGet.mockResolvedValue({ data: () => ({ system_role: "manager" }) })

    await expect(
      getAuthedUser(request({ authorization: "Bearer valid" }))
    ).resolves.toEqual({
      uid: "u1",
      email: "manager@hemtarot.vn",
      system_role: "manager",
    })
  })

  it("defaults to staff when the users doc does not exist", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u2", email: null })
    userDocGet.mockResolvedValue({ data: () => undefined })

    const user = await getAuthedUser(request({ authorization: "Bearer valid" }))
    expect(user.system_role).toBe("staff")
  })

  it("defaults to staff when the stored role is not a known value", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u3", email: "x@hemtarot.vn" })
    userDocGet.mockResolvedValue({ data: () => ({ system_role: "admin" }) })

    const user = await getAuthedUser(request({ authorization: "Bearer valid" }))
    expect(user.system_role).toBe("staff")
  })

  it("propagates a missing-credentials fault instead of masking it as 401", async () => {
    getAdminAuth.mockImplementationOnce(() => {
      throw new Error("Missing Firebase Admin credentials")
    })
    await expect(
      getAuthedUser(request({ authorization: "Bearer valid" }))
    ).rejects.toThrow(/Missing Firebase Admin credentials/)
  })

  it("accepts a case-insensitive bearer scheme", async () => {
    verifyIdToken.mockResolvedValue({ uid: "u4", email: "y@hemtarot.vn" })
    userDocGet.mockResolvedValue({ data: () => ({ system_role: "staff" }) })

    await expect(
      getAuthedUser(request({ authorization: "bearer valid" }))
    ).resolves.toMatchObject({ uid: "u4" })
  })
})
