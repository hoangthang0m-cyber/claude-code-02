import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// AES-256-GCM encryption for third-party secrets/tokens stored at rest
// (Meta long-lived tokens, Google refresh tokens). SPEC muc 1.5:
// "Luu secret/token ben thu ba da ma hoa at-rest".
//
// Wire format: "<iv_b64>:<authTag_b64>:<ciphertext_b64>"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY
  if (!raw) {
    throw new Error("TOKEN_ENC_KEY is not set (base64-encoded 32-byte key)")
  }
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error("TOKEN_ENC_KEY must decode to exactly 32 bytes")
  }
  return key
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":")
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":")
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed ciphertext payload")
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64")
  )
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}
