import { FieldValue } from "firebase-admin/firestore"

import { COLLECTIONS, orgDocumentCreateSchema } from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { parseOrThrow } from "@/lib/server/validate"

// document-library — server operations for the two org-level link libraries
// (biên bản họp + tài liệu tổ chức). Every operation only requires a signed-in
// user (design.md Decision 3: no role check). `created_by` / `updated_by` are a
// trail, never an authorisation gate. The client only reads; all writes come
// through these functions.

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
