import { authedJson } from "@/lib/api/authedFetch"
import type {
  ProjectCreate,
  ProjectFormUpdate,
  ProjectLifecycle,
  ProjectRole,
  SkillTag,
} from "@/lib/domain"

// Client wrappers for the project-workspace APIs (SPEC §5.1). Every call carries
// the Firebase ID token via authedJson; the server enforces permissions.

export function createProject(body: ProjectCreate) {
  return authedJson<{ id: string }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateProject(projectId: string, body: ProjectFormUpdate) {
  return authedJson<{ id: string; sheet_mapping_reset: boolean }>(
    `/api/projects/${projectId}`,
    { method: "PATCH", body: JSON.stringify(body) }
  )
}

// Hard delete — irreversible. `confirmName` must equal the project's exact name.
export function deleteProject(projectId: string, confirmName: string) {
  return authedJson<{
    id: string
    docs_deleted: number
    content_items_deleted: number
  }>(`/api/projects/${projectId}`, {
    method: "DELETE",
    body: JSON.stringify({ confirm_name: confirmName }),
  })
}

export function changeLifecycle(projectId: string, lifecycle: ProjectLifecycle) {
  return authedJson<{
    id: string
    lifecycle: ProjectLifecycle
    retrospective_reminder: boolean
    background_sync_active: boolean
  }>(`/api/projects/${projectId}/lifecycle`, {
    method: "POST",
    body: JSON.stringify({ lifecycle }),
  })
}

export function addProjectMember(
  projectId: string,
  body: { user_id: string; project_role: ProjectRole; skill_tag?: SkillTag | null }
) {
  return authedJson<{ id: string }>(`/api/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function updateProjectMember(
  projectId: string,
  memberId: string,
  body: { project_role?: ProjectRole; skill_tag?: SkillTag | null }
) {
  return authedJson(`/api/projects/${projectId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function removeProjectMember(projectId: string, memberId: string) {
  return authedJson(`/api/projects/${projectId}/members/${memberId}`, {
    method: "DELETE",
  })
}
