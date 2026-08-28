import { authedJson } from "@/lib/api/authedFetch"
import type { ContentFieldUpdate } from "@/lib/domain"

// Client wrappers for the content-pipeline APIs (SPEC §5.2).

export interface ContentListParams {
  assignee?: string
  status?: string
  topic?: string
  overdue?: boolean
  sort?: "deadline" | "updated_at"
}

export interface ContentListRow {
  id: string
  code: string
  status: string
  is_overdue: boolean
  assignee_id?: string
  deadline?: { _seconds: number } | { seconds: number }
  script_url?: string
  video_url?: string
  topic?: string
  content_format?: string
  customer_research_url?: string
  evaluation?: string
  [key: string]: unknown
}

export function listContent(projectId: string, params: ContentListParams = {}) {
  const qs = new URLSearchParams()
  if (params.assignee) qs.set("assignee", params.assignee)
  if (params.status) qs.set("status", params.status)
  if (params.topic) qs.set("topic", params.topic)
  if (params.overdue) qs.set("overdue", "true")
  if (params.sort) qs.set("sort", params.sort)
  const suffix = qs.toString() ? `?${qs}` : ""
  return authedJson<{ items: ContentListRow[] }>(
    `/api/projects/${projectId}/content${suffix}`
  )
}

export function createContentItem(projectId: string, code: string) {
  return authedJson<{ id: string; status: string }>(
    `/api/projects/${projectId}/content`,
    { method: "POST", body: JSON.stringify({ code }) }
  )
}

export function updateContentFields(
  contentItemId: string,
  patch: Partial<Record<keyof ContentFieldUpdate, string | null>>
) {
  return authedJson<{ id: string }>(`/api/content/${contentItemId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

export function assignContent(
  contentItemId: string,
  assignee_id: string | null
) {
  return authedJson<{ id: string; assignee_id: string | null }>(
    `/api/content/${contentItemId}/assignee`,
    { method: "PUT", body: JSON.stringify({ assignee_id }) }
  )
}
