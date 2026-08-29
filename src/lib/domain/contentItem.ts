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
  sheet_row_ref?: string | null
  // Set when the item's row was deleted from the sheet (SPEC §6.3, task 6.7):
  // the item is kept, `sheet_row_ref` is nulled, this stamps when. Cleared if
  // the row comes back. Beyond the §6.1 sketch.
  sheet_unlinked_at?: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
  // Required by SPEC §5.2 R1 ("người cập nhật"); the §6.1 sketch omits it.
  updated_by?: string
}

// Create: only `code` in the body (SPEC §5.2 R1) — project_id comes from the URL.
// status defaults to the first state of the machine, `chua_bat_dau`.
export const contentItemCreateSchema = z.object({
  code: z.string().trim().min(1),
})

export type ContentItemCreate = z.infer<typeof contentItemCreateSchema>

// Field-by-field update (SPEC §5.2 R1): each field independent, none forced.
// Excluded and handled elsewhere: `status` (workflow only, §5.3 / §6.2),
// `assignee_id` (assignment endpoint, §5.2 R2 / task 3.3), `evaluation`
// (manager-only, §5.4 R5 / task 5.9), `sheet_row_ref` (sheets-sync internal).
export const contentFieldUpdateSchema = z.object({
  code: z.string().trim().min(1).optional(),
  deadline: isoDateString.nullable().optional(),
  script_url: urlString.nullable().optional(),
  video_url: urlString.nullable().optional(),
  topic: z.string().trim().nullable().optional(),
  content_format: z.enum(CONTENT_FORMATS).nullable().optional(),
  customer_research_url: urlString.nullable().optional(),
})

export type ContentFieldUpdate = z.infer<typeof contentFieldUpdateSchema>

// SPEC §5.4 R5: the free-text "đánh giá / đề xuất" note. Manager-only; the
// handler also stamps `evaluation_by` + `evaluation_updated_at`. Empty → null.
export const evaluationUpdateSchema = z.object({
  evaluation: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .transform((v) => v || null),
})

export type EvaluationUpdate = z.infer<typeof evaluationUpdateSchema>

// Assign / claim / unassign (SPEC §5.2 R2). `null` = unassign (manager only).
export const assigneeUpdateSchema = z.object({
  assignee_id: idString.nullable(),
})

// Status transition request (SPEC §5.3). `reason` is required only for a return
// and `confirm` only matters for da_duyet → da_len_ads without an ads binding
// (SPEC §5.3 R4: the manager confirms manually) — both enforced against the
// state machine, not here.
export const contentTransitionSchema = z.object({
  to: z.enum(CONTENT_STATUSES),
  reason: z.string().trim().min(1).optional(),
  confirm: z.boolean().optional(),
})

export const CONTENT_ITEM_INITIAL_STATUS: ContentStatus = CONTENT_STATUSES[0]

// A content item is "finished" only at the terminal state (SPEC §3 frames
// `da_len_ads` as the end; the overdue flag is also defined against it).
export function isContentItemDone(status: ContentStatus): boolean {
  return status === "da_len_ads"
}

// SPEC §3 / §6.7: computed, not stored — `deadline < now() AND status != da_len_ads`.
export function isOverdue(
  deadlineMs: number | null | undefined,
  status: ContentStatus,
  nowMs: number
): boolean {
  return deadlineMs != null && deadlineMs < nowMs && !isContentItemDone(status)
}

// Filters / sort for the content list (SPEC §5.2 R4). Query-string shaped;
// unknown values fall back rather than 400 (a filter, not a mutation).
export const contentListFiltersSchema = z.object({
  // assignee_id, or "none" for unassigned
  assignee: z.string().trim().min(1).optional(),
  status: z.enum(CONTENT_STATUSES).optional().catch(undefined),
  topic: z.string().trim().min(1).optional(),
  overdue: z
    .enum(["true", "false"])
    .catch("false")
    .transform((v) => v === "true"),
  sort: z.enum(["deadline", "updated_at"]).catch("updated_at"),
})

export type ContentListFilters = z.infer<typeof contentListFiltersSchema>
