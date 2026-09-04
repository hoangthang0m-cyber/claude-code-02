import { authedJson } from "@/lib/api/authedFetch"
import type {
  ProjectGroupCreate,
  ProjectGroupLifecycle,
  ProjectGroupUpdate,
} from "@/lib/domain"

// Client wrappers for the project-grouping APIs (project-grouping change §2).
// Every call carries the Firebase ID token; the server enforces manager-only.

export function createProjectGroup(body: ProjectGroupCreate) {
  return authedJson<{ id: string }>("/api/project-groups", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateProjectGroup(groupId: string, body: ProjectGroupUpdate) {
  return authedJson<{ id: string }>(`/api/project-groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function setProjectGroupLifecycle(
  groupId: string,
  lifecycle: ProjectGroupLifecycle
) {
  return authedJson<{ id: string; lifecycle: ProjectGroupLifecycle }>(
    `/api/project-groups/${groupId}/lifecycle`,
    { method: "POST", body: JSON.stringify({ lifecycle }) }
  )
}

export function deleteProjectGroup(groupId: string) {
  return authedJson<{ id: string; projects_reassigned: number }>(
    `/api/project-groups/${groupId}`,
    { method: "DELETE" }
  )
}

// Assign a project to a group, move it, or clear it (group_id: null).
export function setProjectGroup(projectId: string, groupId: string | null) {
  return authedJson<{ id: string; group_id: string | null }>(
    `/api/projects/${projectId}/group`,
    { method: "PATCH", body: JSON.stringify({ group_id: groupId }) }
  )
}
