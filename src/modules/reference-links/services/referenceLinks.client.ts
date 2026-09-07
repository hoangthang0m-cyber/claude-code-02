import { authedJson } from "@/lib/api/authedFetch"
import type { ReferenceLinkOwnerType, ReferenceLinkView } from "@/lib/domain"

// Client wrappers for the reference-links API (campaign-page-reference-links
// group 3). Reads go through the API too (firestore.rules blocks client writes;
// reads are allowed but the API keeps the shape + the over-limit flag).

export interface ReferenceLinkListResult {
  links: ReferenceLinkView[]
  over_warn_limit: boolean
}

export function listReferenceLinks(
  ownerType: ReferenceLinkOwnerType,
  ownerId: string
) {
  const q = new URLSearchParams({ owner_type: ownerType, owner_id: ownerId })
  return authedJson<ReferenceLinkListResult>(`/api/reference-links?${q}`)
}

export function addReferenceLink(body: {
  owner_type: ReferenceLinkOwnerType
  owner_id: string
  url: string
  label: string
  note?: string | null
}) {
  return authedJson<{ id: string; over_warn_limit: boolean }>(
    "/api/reference-links",
    { method: "POST", body: JSON.stringify(body) }
  )
}

export function updateReferenceLink(
  linkId: string,
  body: { url?: string; label?: string; note?: string | null }
) {
  return authedJson<{ id: string }>(`/api/reference-links/${linkId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function deleteReferenceLink(linkId: string) {
  return authedJson<{ id: string; removed: true }>(
    `/api/reference-links/${linkId}`,
    { method: "DELETE" }
  )
}

export function reorderReferenceLinks(body: {
  owner_type: ReferenceLinkOwnerType
  owner_id: string
  ordered_ids: string[]
}) {
  return authedJson<{ ordered: number }>("/api/reference-links/reorder", {
    method: "PUT",
    body: JSON.stringify(body),
  })
}
