import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import { AD_ACCOUNT_STATES, type AdAccountState } from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: AdAccountConnection (id, project_owner_id, ad_account_id, name,
//   token_encrypted, token_expires_at, state: connected | needs_reconnect)
//
// `project_owner_id` = the user id of the manager who ran the Meta OAuth
// (SPEC §5.4 R1, §6.4: a long-lived user token). `token_encrypted` is the
// AES-256-GCM payload from src/lib/server/crypto.ts and is NEVER exposed to the
// client (firestore.rules denies client reads on this collection).

export interface AdAccountConnection {
  id: string
  project_owner_id: string
  ad_account_id: string
  name: string
  token_encrypted: string
  token_expires_at: Timestamp
  state: AdAccountState
}

// Written only by the OAuth callback handler (group 7.5). The token and expiry
// are derived server-side from the Meta token exchange, not supplied by the
// caller, so they are not in this schema.
export const adAccountConnectionWriteSchema = z.object({
  project_owner_id: idString,
  ad_account_id: idString,
  name: z.string().trim().min(1),
  state: z.enum(AD_ACCOUNT_STATES).default("connected"),
})

export type AdAccountConnectionWrite = z.infer<
  typeof adAccountConnectionWriteSchema
>

// The manager picks one ad account from the list the OAuth grant can reach
// (SPEC §5.4 R1: "chọn một Ad Account → lưu kết nối"). The long-lived token is
// pulled from the sealed pending-connection cookie, not this body.
export const pickAdAccountSchema = z.object({
  ad_account_id: idString,
  name: z.string().trim().min(1),
})

export type PickAdAccount = z.infer<typeof pickAdAccountSchema>

// What the client is allowed to see about a connection — never the token.
export interface AdAccountConnectionView {
  id: string
  ad_account_id: string
  name: string
  state: AdAccountState
  token_expires_at: number | null
}
