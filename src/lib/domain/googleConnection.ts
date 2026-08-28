import type { Timestamp } from "firebase/firestore"

import type { GoogleConnectionState } from "@/lib/domain/enums"

// SPEC §6.3, task 6.1: the Google OAuth connection of a manager. Not in the §6.1
// sketch (which has no store for the refresh token). Doc id = the manager's
// user id. `refresh_token_encrypted` is the AES-256-GCM payload from
// src/lib/server/crypto.ts and is NEVER exposed to the client
// (firestore.rules denies all client access to the collection).

export interface GoogleConnection {
  id: string
  user_id: string
  email: string
  refresh_token_encrypted: string
  scopes: string[]
  state: GoogleConnectionState
  connected_at: Timestamp
}

// What the client is allowed to see — never the token.
export interface GoogleConnectionView {
  email: string
  scopes: string[]
  state: GoogleConnectionState
  connected_at: number | null
}
