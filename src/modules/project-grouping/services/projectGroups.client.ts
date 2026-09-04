import { authedJson } from "@/lib/api/authedFetch"
import type { ProjectGroupCreate, ProjectGroupUpdate } from "@/lib/domain"

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
