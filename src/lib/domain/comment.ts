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

export const commentWriteSchema = z.object({
  content_item_id: idString,
  body: z.string().trim().min(1),
  mentions: z.array(idString).default([]),
})

export type CommentWrite = z.infer<typeof commentWriteSchema>
