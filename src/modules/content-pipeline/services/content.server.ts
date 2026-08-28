import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  CONTENT_ITEM_INITIAL_STATUS,
  contentItemCreateSchema,
} from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { parseOrThrow } from "@/lib/server/validate"

// Server-side content-pipeline operations (SPEC §5.2).

// SPEC §5.2 R1: any project member (manager OR staff, §2) creates a content
// item with just a code. It starts at `chua_bat_dau`, unassigned, no deadline.
export async function createContentItem(
  actor: AuthedUser,
  projectId: string,
  body: unknown
): Promise<{ id: string; status: typeof CONTENT_ITEM_INITIAL_STATUS }> {
  await requireProjectScope(actor.uid, projectId)
  await assertProjectWritable(projectId)

  const { code } = parseOrThrow(contentItemCreateSchema, body)

  const ref = getAdminDb().collection(COLLECTIONS.contentItems).doc()
  await ref.set({
    project_id: projectId,
    code,
    status: CONTENT_ITEM_INITIAL_STATUS,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  })

  return { id: ref.id, status: CONTENT_ITEM_INITIAL_STATUS }
}
