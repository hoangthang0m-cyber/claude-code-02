import { decryptSecret, encryptSecret } from "@/lib/server/crypto"
import { HttpError } from "@/lib/server/http"

// The anti-forgery `state` carried through a third-party OAuth round-trip (Meta,
// Google, …). AES-256-GCM sealed with TOKEN_ENC_KEY so the browser and the
// provider cannot read or forge it; verified against a plaintext nonce cookie
// for the standard double-submit CSRF check.

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes to finish the provider dialog

interface StatePayload {
  uid: string
  nonce: string
  ts: number
}

export function sealOAuthState(uid: string, nonce: string): string {
  const payload: StatePayload = { uid, nonce, ts: Date.now() }
  return encryptSecret(JSON.stringify(payload))
}

export function openOAuthState(sealed: string, expectedNonce: string): string {
  let payload: StatePayload
  try {
    payload = JSON.parse(decryptSecret(sealed)) as StatePayload
  } catch {
    throw new HttpError(400, "State OAuth không hợp lệ")
  }
  if (payload.nonce !== expectedNonce) {
    throw new HttpError(400, "State OAuth không khớp (CSRF)")
  }
  if (!payload.ts || Date.now() - payload.ts > STATE_TTL_MS) {
    throw new HttpError(400, "Phiên OAuth đã hết hạn — thử kết nối lại")
  }
  return payload.uid
}
