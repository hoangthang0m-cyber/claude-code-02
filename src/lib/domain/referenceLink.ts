import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import { idString } from "@/lib/domain/shared"

// campaign-page-reference-links: a labelled link (Google Sheets, Docs, Drive,
// or any URL) attached to a project OR a content item. The system only stores
// and opens the link — it never reads the content and never syncs (design.md
// Decision 1). One shared collection, discriminated by owner_type + owner_id.

export const REFERENCE_LINK_OWNER_TYPES = ["project", "content_item"] as const
export type ReferenceLinkOwnerType =
  (typeof REFERENCE_LINK_OWNER_TYPES)[number]

// Soft warning threshold — never a hard cap (spec "Cảnh báo khi quá nhiều link").
export const REFERENCE_LINK_WARN_COUNT = 20

export const REFERENCE_LINK_SORT_STEP = 100

// Default label for the migrated `Project.progress_sheet_url` (task 2.2).
export const PROGRESS_LINK_LABEL = "Tiến độ dự án"

export interface ReferenceLink {
  id: string
  owner_type: ReferenceLinkOwnerType
  owner_id: string
  url: string
  label: string
  note?: string | null
  created_by: string
  created_at: Timestamp
  sort_index: number
}

export interface ReferenceLinkView {
  id: string
  owner_type: ReferenceLinkOwnerType
  owner_id: string
  url: string
  label: string
  note: string | null
  sort_index: number
}

// Light URL check only (task 3.4): accept any http(s) URL, no Google API, no
// content fetch. A Sheets / Docs / Drive / arbitrary URL all pass.
const httpUrl = z
  .string()
  .trim()
  .min(1)
  .refine(
    (s) => /^https?:\/\/[^\s]+$/i.test(s),
    "Link phải là URL bắt đầu bằng http:// hoặc https://"
  )

const labelString = z.string().trim().min(1, "Cần nhập nhãn cho link").max(200)
const noteString = z.string().trim().max(2000).nullable().optional()

// owner_type + owner_id come in the body (the route is not owner-scoped).
export const referenceLinkCreateSchema = z.object({
  owner_type: z.enum(REFERENCE_LINK_OWNER_TYPES),
  owner_id: idString,
  url: httpUrl,
  label: labelString,
  note: noteString,
})
export type ReferenceLinkCreate = z.infer<typeof referenceLinkCreateSchema>

export const referenceLinkUpdateSchema = z.object({
  url: httpUrl.optional(),
  label: labelString.optional(),
  note: noteString,
})
export type ReferenceLinkUpdate = z.infer<typeof referenceLinkUpdateSchema>

// Drag-reorder within one owner's list: the full ordered id list (task 3.3).
export const referenceLinkReorderSchema = z.object({
  owner_type: z.enum(REFERENCE_LINK_OWNER_TYPES),
  owner_id: idString,
  ordered_ids: z.array(idString).min(1),
})
export type ReferenceLinkReorder = z.infer<typeof referenceLinkReorderSchema>

// next sort_index for a new link appended to a bucket
export function nextReferenceLinkSortIndex(
  existing: readonly number[]
): number {
  const max = existing.length ? Math.max(...existing) : 0
  return max + REFERENCE_LINK_SORT_STEP
}

// map an ordered id list to evenly-gapped sort_index values
export function reorderReferenceLinks(
  orderedIds: readonly string[]
): Map<string, number> {
  const out = new Map<string, number>()
  orderedIds.forEach((id, i) => out.set(id, (i + 1) * REFERENCE_LINK_SORT_STEP))
  return out
}
