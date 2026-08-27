import {
  COLLECTIONS,
  type ProjectRole,
  type SkillTag,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"

// The ONE shared project-scope permission check (SPEC §2, §6.5; project rule 6).
// Every /api handler that touches a project-owned object calls
// `requireProjectScope` first, then layers role and object-level checks on the
// result. Roles are per-project (`ProjectMember.project_role`), never a hard
// global role — a `system_role: manager` grants nothing on a project they are
// not a member of.

export interface ProjectScope {
  uid: string
  project_id: string
  project_role: ProjectRole
  skill_tag: SkillTag | null
  /** convenience: project_role === "manager" */
  is_manager: boolean
}

// Resolves the caller's ProjectMember record for `projectId`. Throws 403 if they
// are not a member (SPEC §5.1 R4: a non-member opening/editing a project's item
// is rejected).
export async function requireProjectScope(
  uid: string,
  projectId: string
): Promise<ProjectScope> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.projectMembers)
    .where("project_id", "==", projectId)
    .where("user_id", "==", uid)
    .limit(1)
    .get()

  if (snap.empty) {
    throw new HttpError(403, "Bạn không phải thành viên của dự án này")
  }

  const data = snap.docs[0].data() as {
    project_role?: ProjectRole
    skill_tag?: SkillTag | null
  }
  const project_role: ProjectRole =
    data.project_role === "manager" ? "manager" : "staff"

  return {
    uid,
    project_id: projectId,
    project_role,
    skill_tag: data.skill_tag ?? null,
    is_manager: project_role === "manager",
  }
}

// Requires the caller to be a manager of the project (SPEC §2: manage project /
// members / sheet / ad account, approve/return, bind ads, evaluation).
export function requireProjectManager(scope: ProjectScope): void {
  if (!scope.is_manager) {
    throw new HttpError(403, "Chỉ Trưởng phòng dự án được thực hiện thao tác này")
  }
}

// Requires a global manager. Used only where there is no project context yet —
// creating a new project (SPEC §6.9: a manager account creates projects).
export function requireSystemManager(user: AuthedUser): void {
  if (user.system_role !== "manager") {
    throw new HttpError(403, "Chỉ Trưởng phòng được tạo dự án")
  }
}
