import { FieldValue, Timestamp } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  CONTENT_ITEM_INITIAL_STATUS,
  assigneeUpdateSchema,
  contentFieldUpdateSchema,
  contentItemCreateSchema,
  contentListFiltersSchema,
  isOverdue,
  projectMemberDocId,
  type ContentListFilters,
  type ContentStatus,
} from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"
import { queueNotification } from "@/modules/notifications/services/notify.server"

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
    data: snap.data() as {
      project_id: string
      code?: string
      assignee_id?: string | null
    } & Record<string, unknown>,
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

export interface ContentListItem {
  id: string
  is_overdue: boolean
  [key: string]: unknown
}

// SPEC §5.2 R4 / R3: list a project's content items with in-memory filtering
// (assignee / status / topic / overdue) and sorting (deadline | updated_at).
// `is_overdue` is computed per item (§6.7), never stored. Filtering in memory
// avoids Firestore composite indexes; a rollup can be added later if slow.
export async function listContentItems(
  actor: AuthedUser,
  projectId: string,
  rawFilters: unknown
): Promise<{ items: ContentListItem[] }> {
  await requireProjectScope(actor.uid, projectId)
  const filters: ContentListFilters = contentListFiltersSchema.parse(
    rawFilters ?? {}
  )

  const snap = await getAdminDb()
    .collection(COLLECTIONS.contentItems)
    .where("project_id", "==", projectId)
    .get()

  const now = Date.now()
  let items: ContentListItem[] = snap.docs.map((d) => {
    const data = d.data()
    const deadlineMs =
      typeof data.deadline?.toMillis === "function"
        ? data.deadline.toMillis()
        : null
    return {
      id: d.id,
      ...data,
      is_overdue: isOverdue(deadlineMs, data.status as ContentStatus, now),
    }
  })

  if (filters.assignee === "none") {
    items = items.filter((i) => !i.assignee_id)
  } else if (filters.assignee) {
    items = items.filter((i) => i.assignee_id === filters.assignee)
  }
  if (filters.status) {
    items = items.filter((i) => i.status === filters.status)
  }
  if (filters.topic) {
    items = items.filter((i) => i.topic === filters.topic)
  }
  if (filters.overdue) {
    items = items.filter((i) => i.is_overdue)
  }

  items.sort((a, b) => {
    if (filters.sort === "deadline") {
      const av = deadlineMillis(a)
      const bv = deadlineMillis(b)
      return av - bv // ascending, items without a deadline last
    }
    return updatedMillis(b) - updatedMillis(a) // updated_at descending
  })

  return { items }
}

function deadlineMillis(item: ContentListItem): number {
  const d = item.deadline as { toMillis?: () => number } | undefined
  return typeof d?.toMillis === "function" ? d.toMillis() : Number.MAX_SAFE_INTEGER
}

function updatedMillis(item: ContentListItem): number {
  const d = item.updated_at as { toMillis?: () => number } | undefined
  return typeof d?.toMillis === "function" ? d.toMillis() : 0
}

// SPEC §5.2 R2: assign a content item to exactly one project member.
// Manager: assign anyone (or null to unassign). Staff: only self-claim, and only
// while the item is unassigned. The assignee is notified (unless they claimed it
// themselves).
export async function assignContentItem(
  actor: AuthedUser,
  contentItemId: string,
  body: unknown
): Promise<{ id: string; assignee_id: string | null }> {
  const { ref, data } = await loadContentItem(contentItemId)
  const projectId = data.project_id
  const scope = await requireProjectScope(actor.uid, projectId)
  await assertProjectWritable(projectId)

  const { assignee_id: target } = parseOrThrow(assigneeUpdateSchema, body)
  const db = getAdminDb()

  if (!scope.is_manager) {
    // Staff: self-claim only, only when currently unassigned.
    if (target !== actor.uid) {
      throw new HttpError(403, "Nhân sự chỉ được tự nhận việc")
    }
    if (data.assignee_id) {
      throw new HttpError(409, "Hạng mục đã có người thực hiện")
    }
  }

  if (target !== null) {
    const member = await db
      .collection(COLLECTIONS.projectMembers)
      .doc(projectMemberDocId(projectId, target))
      .get()
    if (!member.exists) {
      throw new HttpError(400, "Người được giao không phải thành viên dự án")
    }
  }

  const batch = db.batch()
  batch.update(ref, {
    assignee_id: target,
    updated_at: FieldValue.serverTimestamp(),
    updated_by: actor.uid,
  })
  // SPEC §5.7 R1: notify the assignee — but not when they claimed it themselves.
  if (target !== null && target !== actor.uid) {
    queueNotification(db, batch, {
      recipient_id: target,
      type: "content_assigned",
      content_item_id: contentItemId,
      project_id: projectId,
      message: `Bạn được giao hạng mục ${data.code ?? contentItemId}`,
    })
  }
  await batch.commit()

  return { id: contentItemId, assignee_id: target }
}
