import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  filterAndSortOrgDocuments,
  orgDocumentCreateSchema,
  orgDocumentListQuerySchema,
  orgDocumentUpdateSchema,
  type OrgDocumentCategory,
  type OrgDocumentView,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// document-library — server operations for the two org-level link libraries
// (biên bản họp + tài liệu tổ chức). Every operation only requires a signed-in
// user (design.md Decision 3: no role check); the route handler enforces auth,
// so a caller that reaches these functions is authenticated. `created_by` /
// `updated_by` are a trail, never an authorisation gate. The client only reads.

function tsMs(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : null
}

function toView(id: string, d: Record<string, unknown>): OrgDocumentView {
  return {
    id,
    category: d.category as OrgDocumentCategory,
    title: String(d.title ?? ""),
    url: String(d.url ?? ""),
    doc_date: (d.doc_date as string | null | undefined) ?? null,
    note: (d.note as string | null | undefined) ?? null,
    created_by: String(d.created_by ?? ""),
    created_at: tsMs(d.created_at),
    updated_by: (d.updated_by as string | null | undefined) ?? null,
    updated_at: tsMs(d.updated_at),
  }
}

async function loadOrgDocument(docId: string) {
  const ref = getAdminDb().collection(COLLECTIONS.orgDocuments).doc(docId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpError(404, "Không tìm thấy tài liệu")
  }
  return { ref, data: snap.data() as Record<string, unknown> }
}

// task 1.2 — add an item. `category` + `title` + `url` are required and the URL
// must have an http(s) scheme (checked by the schema, no network call).
export async function createOrgDocument(
  actor: AuthedUser,
  body: unknown
): Promise<{ id: string }> {
  const input = parseOrThrow(orgDocumentCreateSchema, body)
  const ref = getAdminDb().collection(COLLECTIONS.orgDocuments).doc()

  await ref.set({
    category: input.category,
    title: input.title,
    url: input.url,
    doc_date: input.doc_date ?? null,
    note: input.note ?? null,
    created_by: actor.uid,
    created_at: FieldValue.serverTimestamp(),
    updated_by: actor.uid,
    updated_at: FieldValue.serverTimestamp(),
  })

  return { id: ref.id }
}

// task 1.3 — edit an item (title / url / doc_date / note). `category` is fixed.
// `null` for doc_date / note clears it. Stamps updated_by / updated_at.
export async function updateOrgDocument(
  actor: AuthedUser,
  docId: string,
  body: unknown
): Promise<{ id: string }> {
  const input = parseOrThrow(orgDocumentUpdateSchema, body)
  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }

  const { ref } = await loadOrgDocument(docId)
  await ref.update({
    ...input,
    updated_by: actor.uid,
    updated_at: FieldValue.serverTimestamp(),
  })
  return { id: docId }
}

// task 1.3 — remove an item. Hard delete (design.md: no trash at this version);
// other items are untouched.
export async function deleteOrgDocument(
  docId: string
): Promise<{ id: string; deleted: true }> {
  const { ref } = await loadOrgDocument(docId)
  await ref.delete()
  return { id: docId, deleted: true }
}

// task 1.4 — list one library, with an optional partial-title search and a sort
// (doc_date desc default — undated last; or updated_at desc).
export async function listOrgDocuments(
  query: unknown
): Promise<{ items: OrgDocumentView[] }> {
  const { category, q, sort } = parseOrThrow(orgDocumentListQuerySchema, query)

  const snap = await getAdminDb()
    .collection(COLLECTIONS.orgDocuments)
    .where("category", "==", category)
    .get()

  const views = snap.docs.map((d) => toView(d.id, d.data()))
  return { items: filterAndSortOrgDocuments(views, { q, sort }) }
}
