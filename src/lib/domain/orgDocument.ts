import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

// document-library (design.md Decision 1): a labelled external link in one of
// two org-level libraries — "biên bản họp" and "tài liệu tổ chức" —
// discriminated by `category`. One collection `orgDocuments`. The system only
// stores and opens the link; it never reads the content and never syncs. Not
// tied to "Cuộc họp", a project, or a content item. Every signed-in member can
// add / edit / delete (design.md Decision 3); `created_by` / `updated_by` are a
// trail only, never an authorisation check.

export const ORG_DOCUMENT_CATEGORIES = [
  "meeting_minutes",
  "org_document",
] as const
export type OrgDocumentCategory = (typeof ORG_DOCUMENT_CATEGORIES)[number]

export const ORG_DOCUMENT_CATEGORY_LABELS: Record<OrgDocumentCategory, string> =
  {
    meeting_minutes: "Biên bản họp",
    org_document: "Tài liệu tổ chức",
  }

export interface OrgDocument {
  id: string
  category: OrgDocumentCategory
  title: string
  url: string
  /** "YYYY-MM-DD" — meeting date (minutes) or document date; optional. */
  doc_date?: string | null
  note?: string | null
  created_by: string
  created_at: Timestamp
  updated_by?: string
  updated_at: Timestamp
}

export interface OrgDocumentView {
  id: string
  category: OrgDocumentCategory
  title: string
  url: string
  doc_date: string | null
  note: string | null
  created_by: string
  created_at: number | null
  updated_by: string | null
  updated_at: number | null
}

// Light URL check only (design.md Decision 4): an http(s) URL, no network call,
// no provider detection. A Sheets / Docs / Drive / arbitrary URL all pass.
const httpUrl = z
  .string()
  .trim()
  .min(1)
  .refine(
    (s) => /^https?:\/\/[^\s]+$/i.test(s),
    "Link phải là URL bắt đầu bằng http:// hoặc https://"
  )

const titleString = z.string().trim().min(1, "Cần nhập tiêu đề").max(300)
const docDateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải là dạng YYYY-MM-DD")
const noteString = z.string().trim().max(2000)

// Create: category + title + url required; doc_date + note optional.
export const orgDocumentCreateSchema = z.object({
  category: z.enum(ORG_DOCUMENT_CATEGORIES),
  title: titleString,
  url: httpUrl,
  doc_date: docDateString.nullable().optional(),
  note: noteString.nullable().optional(),
})
export type OrgDocumentCreate = z.infer<typeof orgDocumentCreateSchema>

// Edit: title / url / doc_date / note. `category` is fixed once created — an
// item belongs to exactly one library. `null` clears doc_date / note.
export const orgDocumentUpdateSchema = z.object({
  title: titleString.optional(),
  url: httpUrl.optional(),
  doc_date: docDateString.nullable().optional(),
  note: noteString.nullable().optional(),
})
export type OrgDocumentUpdate = z.infer<typeof orgDocumentUpdateSchema>

// ── task 1.4: list / search / sort ─────────────────────────────────────────

export const ORG_DOCUMENT_SORTS = ["doc_date", "updated_at"] as const
export type OrgDocumentSort = (typeof ORG_DOCUMENT_SORTS)[number]

// The list query: one library (required), optional partial-title search, sort.
// An unknown / missing `sort` falls back to "doc_date" (a filter, not a
// mutation — never a 400).
export const orgDocumentListQuerySchema = z.object({
  category: z.enum(ORG_DOCUMENT_CATEGORIES),
  q: z.string().trim().min(1).optional(),
  sort: z.enum(ORG_DOCUMENT_SORTS).catch("doc_date"),
})
export type OrgDocumentListQuery = z.infer<typeof orgDocumentListQuerySchema>

// Pure: filter by a case-insensitive partial title match, then sort.
//   "doc_date"   — newest date first; items with no `doc_date` go last;
//                  ties break by most-recently-updated.
//   "updated_at" — most recently updated first.
export function filterAndSortOrgDocuments(
  items: readonly OrgDocumentView[],
  opts: { q?: string; sort: OrgDocumentSort }
): OrgDocumentView[] {
  const needle = opts.q?.trim().toLowerCase()
  const rows = needle
    ? items.filter((d) => d.title.toLowerCase().includes(needle))
    : [...items]

  const byUpdated = (a: OrgDocumentView, b: OrgDocumentView) =>
    (b.updated_at ?? 0) - (a.updated_at ?? 0)

  if (opts.sort === "updated_at") return rows.sort(byUpdated)

  return rows.sort((a, b) => {
    if (a.doc_date && b.doc_date) {
      if (a.doc_date !== b.doc_date) return a.doc_date < b.doc_date ? 1 : -1
      return byUpdated(a, b)
    }
    if (a.doc_date) return -1
    if (b.doc_date) return 1
    return byUpdated(a, b)
  })
}
