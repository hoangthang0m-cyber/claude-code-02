import { authedJson } from "@/lib/api/authedFetch"
import type {
  KnowledgeEntryCreate,
  KnowledgeEntryUpdate,
  KnowledgeLifecycle,
  KnowledgeLinkSection,
  KnowledgeProjectRefType,
} from "@/lib/domain"

// Client wrappers for the knowledge-base APIs. Reads use `onSnapshot` directly
// (see the hooks); these cover every mutation. Any signed-in member may call
// them — the server enforces manager-only for delete / lifecycle.

// ── entry ─────────────────────────────────────────────────────────────────

export function createKnowledgeEntry(body: KnowledgeEntryCreate) {
  return authedJson<{ id: string }>("/api/knowledge", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateKnowledgeEntry(entryId: string, body: KnowledgeEntryUpdate) {
  return authedJson<{ id: string }>(`/api/knowledge/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function setKnowledgeEntryLifecycle(
  entryId: string,
  lifecycle: KnowledgeLifecycle
) {
  return authedJson<{ id: string; lifecycle: KnowledgeLifecycle }>(
    `/api/knowledge/${entryId}/lifecycle`,
    { method: "POST", body: JSON.stringify({ lifecycle }) }
  )
}

export function deleteKnowledgeEntry(entryId: string, confirmName: string) {
  return authedJson<{ id: string; links_removed: number; refs_removed: number }>(
    `/api/knowledge/${entryId}`,
    { method: "DELETE", body: JSON.stringify({ confirm_name: confirmName }) }
  )
}

// ── links ─────────────────────────────────────────────────────────────────

export function addKnowledgeLink(
  entryId: string,
  body: {
    section: KnowledgeLinkSection
    url: string
    label: string
    note?: string | null
  }
) {
  return authedJson<{ id: string; over_warn_limit: boolean }>(
    `/api/knowledge/${entryId}/links`,
    { method: "POST", body: JSON.stringify(body) }
  )
}

export function updateKnowledgeLink(
  linkId: string,
  body: { url?: string; label?: string; note?: string | null }
) {
  return authedJson<{ id: string }>(`/api/knowledge/links/${linkId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function deleteKnowledgeLink(linkId: string) {
  return authedJson<{ id: string; removed: true }>(
    `/api/knowledge/links/${linkId}`,
    { method: "DELETE" }
  )
}

export function reorderKnowledgeLinks(
  entryId: string,
  body: { section: KnowledgeLinkSection; ordered_ids: string[] }
) {
  return authedJson<{ ordered: number }>(
    `/api/knowledge/${entryId}/links/reorder`,
    { method: "PUT", body: JSON.stringify(body) }
  )
}

// ── project / group references ────────────────────────────────────────────

export function addKnowledgeProjectRef(
  entryId: string,
  body: { ref_type: KnowledgeProjectRefType; ref_id: string; note?: string | null }
) {
  return authedJson<{ id: string; ref_name: string }>(
    `/api/knowledge/${entryId}/refs`,
    { method: "POST", body: JSON.stringify(body) }
  )
}

export function deleteKnowledgeProjectRef(refId: string) {
  return authedJson<{ id: string; removed: true }>(
    `/api/knowledge/refs/${refId}`,
    { method: "DELETE" }
  )
}
