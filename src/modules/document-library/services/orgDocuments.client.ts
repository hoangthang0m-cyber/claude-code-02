import { authedJson } from "@/lib/api/authedFetch"
import type {
  OrgDocumentCategory,
  OrgDocumentCreate,
  OrgDocumentSort,
  OrgDocumentUpdate,
  OrgDocumentView,
} from "@/lib/domain"

// Client wrappers for the document-library APIs. Every call carries the Firebase
// ID token; the server only requires a signed-in user (no role check).

export function listOrgDocuments(params: {
  category: OrgDocumentCategory
  q?: string
  sort?: OrgDocumentSort
}) {
  const qs = new URLSearchParams({ category: params.category })
  if (params.q) qs.set("q", params.q)
  if (params.sort) qs.set("sort", params.sort)
  return authedJson<{ items: OrgDocumentView[] }>(`/api/documents?${qs}`)
}

export function createOrgDocument(body: OrgDocumentCreate) {
  return authedJson<{ id: string }>("/api/documents", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateOrgDocument(id: string, body: OrgDocumentUpdate) {
  return authedJson<{ id: string }>(`/api/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function deleteOrgDocument(id: string) {
  return authedJson<{ id: string; deleted: true }>(`/api/documents/${id}`, {
    method: "DELETE",
  })
}
