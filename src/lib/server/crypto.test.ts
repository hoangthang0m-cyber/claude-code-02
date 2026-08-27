import { randomBytes } from "node:crypto"

import { beforeAll, describe, expect, it } from "vitest"

import { decryptSecret, encryptSecret } from "@/lib/server/crypto"

beforeAll(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64")
})

describe("server crypto (AES-256-GCM at-rest, SPEC 1.5)", () => {
  it("round-trips a secret", () => {
    const secret = "EAAxxxxx-meta-long-lived-token"
    expect(decryptSecret(encryptSecret(secret))).toBe(secret)
  })

  it("uses a random IV so ciphertext differs per call", () => {
    expect(encryptSecret("same-input")).not.toBe(encryptSecret("same-input"))
  })

  it("rejects tampered ciphertext (auth tag mismatch)", () => {
    const payload = encryptSecret("sensitive")
    const flippedLast = payload.endsWith("A") ? "B" : "A"
    const tampered = payload.slice(0, -1) + flippedLast
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it("rejects a malformed payload", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow()
  })
})
