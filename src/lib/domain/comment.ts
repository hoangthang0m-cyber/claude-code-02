import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import { idString } from "@/lib/domain/shared"

// SPEC §6.1: Comment (id, content_item_id, author_id, body, mentions: User[],
//   created_at)
// `mentions` is stored as an array of user ids (not embedded user docs).
// author_id comes from the auth context; created_at is server-set.

export interface Comment {
  id: string
  content_item_id: string
  author_id: string
  body: string
  mentions: string[]
  created_at: Timestamp
}

// Create a comment (SPEC §5.2 R5) — content_item_id comes from the URL.
// `mentions` are user ids the client resolved from @names; each must be a
// project member (SPEC §8 Q2, answered) — enforced in the handler.
export const commentCreateSchema = z.object({
  body: z.string().trim().min(1),
  mentions: z.array(idString).default([]),
})

export type CommentCreate = z.infer<typeof commentCreateSchema>
