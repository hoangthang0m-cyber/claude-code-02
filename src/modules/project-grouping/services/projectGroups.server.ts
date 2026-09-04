import { FieldValue } from "firebase-admin/firestore"

import { COLLECTIONS, projectGroupCreateSchema } from "@/lib/domain"
import { requireSystemManager } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { parseOrThrow } from "@/lib/server/validate"

// project-grouping change §2 — CRUD for ProjectGroup. Every operation is
// manager-only (design.md Decision 3, reusing requireSystemManager) and goes
// through firebase-admin; the client only reads.

export interface CreateProjectGroupResult {
  id: string
}

// task 2.1 — create a group. name required, description optional; lifecycle
// starts "active"; created_by comes from the verified auth context.
export async function createProjectGroup(
  actor: AuthedUser,
  body: unknown
): Promise<CreateProjectGroupResult> {
  requireSystemManager(actor)

  const input = parseOrThrow(projectGroupCreateSchema, body)
  const ref = getAdminDb().collection(COLLECTIONS.projectGroups).doc()

  await ref.set({
    ...input,
    lifecycle: "active",
    created_by: actor.uid,
    created_at: FieldValue.serverTimestamp(),
  })

  return { id: ref.id }
}
