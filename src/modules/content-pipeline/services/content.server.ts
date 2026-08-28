import { FieldValue, Timestamp } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  CONTENT_ITEM_INITIAL_STATUS,
  contentFieldUpdateSchema,
  contentItemCreateSchema,
} from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// Server-side content-pipeline operations (SPEC §5.2).

async function loadContentItem(contentItemId: string) {
  const ref = getAdminDb()
    .collection(COLLECTIONS.contentItems)
    .doc(contentItemId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpError(404, "Không tìm thấy hạng mục")
  }
  return {
    ref,
    data: snap.data() as { project_id: string } & Record<string, unknown>,
  }
}

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

// SPEC §5.2 R1: any project member edits content fields one at a time; each save
// stamps updated_at + updated_by and never forces other fields. `status`,
// `assignee_id` and `evaluation` are handled by their own endpoints.
export async function updateContentItemFields(
  actor: AuthedUser,
  contentItemId: string,
  body: unknown
): Promise<{ id: string }> {
  const { ref, data } = await loadContentItem(contentItemId)
  await requireProjectScope(actor.uid, data.project_id)
  await assertProjectWritable(data.project_id)

  const input = parseOrThrow(contentFieldUpdateSchema, body)
  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }

  const patch: Record<string, unknown> = {
    updated_at: FieldValue.serverTimestamp(),
    updated_by: actor.uid,
  }
  for (const [key, value] of Object.entries(input)) {
    patch[key] =
      key === "deadline" && typeof value === "string"
        ? Timestamp.fromDate(new Date(value))
        : value
  }

  await ref.update(patch)
  return { id: contentItemId }
}
