import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import {
  CONTENT_FORMATS,
  CONTENT_STATUSES,
  type ContentFormat,
  type ContentStatus,
} from "@/lib/domain/enums"
import { idString, isoDateString, urlString } from "@/lib/domain/shared"

// SPEC §6.1 + §4: ContentItem
//   (id, project_id, code, deadline nullable, assignee_id nullable,
//    script_url nullable, video_url nullable, topic nullable,
//    customer_research_url nullable, status, evaluation nullable,
//    sheet_row_ref nullable, created_at, updated_at)
// + content_format (SPEC §8 Q3, answered): fixed enum, optional.

export interface ContentItem {
  id: string
  project_id: string
  code: string
  deadline?: Timestamp
  assignee_id?: string
  script_url?: string
  video_url?: string
  topic?: string
  content_format?: ContentFormat
  customer_research_url?: string
  status: ContentStatus
  evaluation?: string
  sheet_row_ref?: string
  created_at: Timestamp
  updated_at: Timestamp
}

// Create: only code + project_id required (SPEC §5.2 R1). status defaults to the
// first state of the machine, `chua_bat_dau`.
export const contentItemCreateSchema = z.object({
  project_id: idString,
  code: z.string().trim().min(1),
})

export type ContentItemCreate = z.infer<typeof contentItemCreateSchema>

// Field-by-field update (SPEC §5.2 R1): each field independent, none forced.
// `status` is NOT updatable here — it moves only through the workflow
// (SPEC §5.3, §6.2). `evaluation` is manager-only (SPEC §5.4 R5) — enforced in
// the handler, not the schema.
export const contentItemUpdateSchema = z.object({
  code: z.string().trim().min(1).optional(),
  deadline: isoDateString.nullable().optional(),
  assignee_id: idString.nullable().optional(),
  script_url: urlString.nullable().optional(),
  video_url: urlString.nullable().optional(),
  topic: z.string().trim().nullable().optional(),
  content_format: z.enum(CONTENT_FORMATS).nullable().optional(),
  customer_research_url: urlString.nullable().optional(),
  evaluation: z.string().trim().nullable().optional(),
})

export type ContentItemUpdate = z.infer<typeof contentItemUpdateSchema>

export const CONTENT_ITEM_INITIAL_STATUS: ContentStatus = CONTENT_STATUSES[0]

// A content item is "finished" only at the terminal state (SPEC §3 frames
// `da_len_ads` as the end; the overdue flag is also defined against it).
export function isContentItemDone(status: ContentStatus): boolean {
  return status === "da_len_ads"
}
