import { auth } from "@/firebase/config"

// Client-side helper: every call to a /api route handler goes through here so
// the caller's Firebase ID token is attached (server verifies it in
// src/lib/server/auth.ts). Used for all mutations from group 7.2 onward — reads
// stay on the Firebase Web SDK / onSnapshot for realtime.

export async function authedFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const current = auth.currentUser
  if (!current) {
    throw new Error("Chưa đăng nhập")
  }

  const token = await current.getIdToken()
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${token}`)
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return fetch(input, { ...init, headers })
}

// Convenience wrapper: send/receive JSON, throw on a non-2xx response using the
// server's `{ error }` message.
export async function authedJson<T = unknown>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await authedFetch(input, init)
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null

  if (!res.ok) {
    throw new Error(body?.error ?? `Yêu cầu thất bại (${res.status})`)
  }
  return body as T
}
