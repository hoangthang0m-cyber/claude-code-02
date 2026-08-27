import { FieldValue } from "firebase-admin/firestore"

import { COLLECTIONS, projectCreateSchema } from "@/lib/domain"
import { requireSystemManager } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { parseOrThrow } from "@/lib/server/validate"

// Server-side project operations (SPEC §5.1). Route handlers under
// src/app/api/projects/ wrap these with getAuthedUser + errorResponse.

export interface CreateProjectResult {
  id: string
}

// SPEC §5.1 R1: create a project from the standard form. name + objective are
// required; the creator becomes a project manager; lifecycle starts "running".
export async function createProject(
  actor: AuthedUser,
  body: unknown
): Promise<CreateProjectResult> {
  requireSystemManager(actor)

  const input = parseOrThrow(projectCreateSchema, body)
  const db = getAdminDb()

  const projectRef = db.collection(COLLECTIONS.projects).doc()
  const memberRef = db.collection(COLLECTIONS.projectMembers).doc()

  const batch = db.batch()
  batch.set(projectRef, {
    ...input,
    lifecycle: "running",
    created_by: actor.uid,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  })
  // SPEC §5.1 R1: "gán người tạo là Trưởng phòng dự án".
  batch.set(memberRef, {
    project_id: projectRef.id,
    user_id: actor.uid,
    project_role: "manager",
    skill_tag: null,
  })
  await batch.commit()

  return { id: projectRef.id }
}
