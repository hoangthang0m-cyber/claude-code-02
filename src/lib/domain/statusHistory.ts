import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import { CONTENT_STATUSES, type ContentStatus } from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: StatusHistory (id, content_item_id, from_status, to_status,
//   actor_id, reason nullable, created_at)
// Written by the workflow handler in the same batch as the ContentItem status
// change (SPEC §5.3 R5). actor_id comes from the auth context; created_at is
// server-set.

export interface StatusHistory {
  id: string
  content_item_id: string
  from_status: ContentStatus
  to_status: ContentStatus
  actor_id: string
  reason?: string
  created_at: Timestamp
}

export const statusHistoryWriteSchema = z.object({
  content_item_id: idString,
  from_status: z.enum(CONTENT_STATUSES),
  to_status: z.enum(CONTENT_STATUSES),
  // Required only on a return step (SPEC §5.3 R3) — enforced by the state
  // machine / handler, not this schema.
  reason: z.string().trim().min(1).optional(),
})

export type StatusHistoryWrite = z.infer<typeof statusHistoryWriteSchema>
