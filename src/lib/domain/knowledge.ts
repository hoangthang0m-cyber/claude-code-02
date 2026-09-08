import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import {
  KNOWLEDGE_LIFECYCLES,
  KNOWLEDGE_LINK_SECTIONS,
  KNOWLEDGE_PROJECT_REF_TYPES,
  type KnowledgeLifecycle,
  type KnowledgeLinkSection,
  type KnowledgeProjectRefType,
} from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// knowledge-base change (design.md Decision 1) — the org knowledge base. Three
// collections, fully separate from `reference-links` (that one is
// project-scoped; knowledge is org-level: any signed-in member writes).
//
//   knowledgeEntries      — one document per knowledge item, 5 fixed sections
//   knowledgeLinks        — a labelled external link on one entry's section
//   knowledgeProjectRefs  — a Project / ProjectGroup reference on "Quá trình
//                           đúc kết"; stores a name SNAPSHOT, never a live join
//
// The system only stores and opens links / references — it never reads their
// content and never syncs (same principle as `reference-links`).

// ── length caps (design.md Risks) ─────────────────────────────────────────
const OVERVIEW_MAX = 5000
const NOTE_SECTION_MAX = 20000
const LABEL_MAX = 200
const NOTE_MAX = 2000

// ── knowledgeEntries ──────────────────────────────────────────────────────

export interface KnowledgeEntry {
  id: string
  name: string
  overview: string
  detail_note?: string
  process_note?: string
  conclusion_note?: string
  lifecycle: KnowledgeLifecycle
  created_by: string
  created_at: Timestamp
  updated_by?: string
  updated_at: Timestamp
}

export interface KnowledgeEntryView {
  id: string
  name: string
  overview: string
  detail_note: string
  process_note: string
  conclusion_note: string
  lifecycle: KnowledgeLifecycle
  created_by: string
  created_at: number | null
  updated_by: string | null
  updated_at: number | null
}

const nameString = z.string().trim().min(1, "Cần nhập tên tri thức").max(300)
const overviewString = z
  .string()
  .trim()
  .min(1, "Cần nhập mô tả tổng quan")
  .max(OVERVIEW_MAX)
const sectionNoteString = z.string().trim().max(NOTE_SECTION_MAX)

// Create: name + overview required; the three free-text sections optional.
export const knowledgeEntryCreateSchema = z.object({
  name: nameString,
  overview: overviewString,
  detail_note: sectionNoteString.optional(),
  process_note: sectionNoteString.optional(),
  conclusion_note: sectionNoteString.optional(),
})
export type KnowledgeEntryCreate = z.infer<typeof knowledgeEntryCreateSchema>

// Edit: every field optional, but name / overview cannot be blanked. `null`
// clears a section note.
export const knowledgeEntryUpdateSchema = z.object({
  name: nameString.optional(),
  overview: overviewString.optional(),
  detail_note: sectionNoteString.nullable().optional(),
  process_note: sectionNoteString.nullable().optional(),
  conclusion_note: sectionNoteString.nullable().optional(),
})
export type KnowledgeEntryUpdate = z.infer<typeof knowledgeEntryUpdateSchema>

// Archive / restore — its own validated path (mirrors projectGroupLifecycleSchema).
export const knowledgeEntryLifecycleSchema = z.object({
  lifecycle: z.enum(KNOWLEDGE_LIFECYCLES),
})

// Hard delete — the caller must echo the entry's exact name (mirrors
// projectDeleteSchema).
export const knowledgeEntryDeleteSchema = z.object({
  confirm_name: z.string().trim().min(1),
})

// An archived entry is read-only (spec) — mirrors `isProjectGroupWritable`.
export function isKnowledgeEntryWritable(
  lifecycle: KnowledgeLifecycle | string | undefined
): boolean {
  return lifecycle !== "archived"
}

// ── knowledgeLinks ────────────────────────────────────────────────────────

export interface KnowledgeLink {
  id: string
  entry_id: string
  section: KnowledgeLinkSection
  url: string
  label: string
  note?: string | null
  created_by: string
  created_at: Timestamp
  sort_index: number
}

export interface KnowledgeLinkView {
  id: string
  entry_id: string
  section: KnowledgeLinkSection
  url: string
  label: string
  note: string | null
  sort_index: number
}

// Light URL check only (design.md / spec): http(s) scheme, no network call.
const httpUrl = z
  .string()
  .trim()
  .min(1)
  .refine(
    (s) => /^https?:\/\/[^\s]+$/i.test(s),
    "Link phải là URL bắt đầu bằng http:// hoặc https://"
  )
const labelString = z.string().trim().min(1, "Cần nhập nhãn cho link").max(LABEL_MAX)
const noteString = z.string().trim().max(NOTE_MAX).nullable().optional()

// `entry_id` comes from the URL; `section` in the body.
export const knowledgeLinkCreateSchema = z.object({
  section: z.enum(KNOWLEDGE_LINK_SECTIONS),
  url: httpUrl,
  label: labelString,
  note: noteString,
})
export type KnowledgeLinkCreate = z.infer<typeof knowledgeLinkCreateSchema>

export const knowledgeLinkUpdateSchema = z.object({
  url: httpUrl.optional(),
  label: labelString.optional(),
  note: noteString,
})
export type KnowledgeLinkUpdate = z.infer<typeof knowledgeLinkUpdateSchema>

// Reorder the links of one (entry_id, section): the full ordered id list.
export const knowledgeLinkReorderSchema = z.object({
  section: z.enum(KNOWLEDGE_LINK_SECTIONS),
  ordered_ids: z.array(idString).min(1),
})
export type KnowledgeLinkReorder = z.infer<typeof knowledgeLinkReorderSchema>

// ── knowledgeProjectRefs ──────────────────────────────────────────────────

export interface KnowledgeProjectRef {
  id: string
  entry_id: string
  ref_type: KnowledgeProjectRefType
  ref_id: string
  /** name snapshot taken server-side at attach time — never re-synced */
  ref_name: string
  note?: string | null
  created_by: string
  created_at: Timestamp
  sort_index: number
}

export interface KnowledgeProjectRefView {
  id: string
  entry_id: string
  ref_type: KnowledgeProjectRefType
  ref_id: string
  ref_name: string
  note: string | null
  sort_index: number
}

// `entry_id` from the URL; `ref_name` is NOT trusted from the body — the server
// reads it from the target doc.
export const knowledgeProjectRefCreateSchema = z.object({
  ref_type: z.enum(KNOWLEDGE_PROJECT_REF_TYPES),
  ref_id: idString,
  note: noteString,
})
export type KnowledgeProjectRefCreate = z.infer<
  typeof knowledgeProjectRefCreateSchema
>

// The `/campaigns` path a reference card links to.
export function knowledgeRefHref(
  ref: Pick<KnowledgeProjectRefView, "ref_type" | "ref_id">
): string {
  return ref.ref_type === "project_group"
    ? `/campaigns/groups/${ref.ref_id}`
    : `/campaigns/${ref.ref_id}`
}
