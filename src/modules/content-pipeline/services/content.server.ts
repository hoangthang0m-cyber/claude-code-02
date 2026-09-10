import { FieldValue, Timestamp } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  CONTENT_ITEM_INITIAL_STATUS,
  assigneeUpdateSchema,
  contentFieldUpdateSchema,
  contentItemCreateSchema,
  contentItemDeleteSchema,
  contentListFiltersSchema,
  evaluationUpdateSchema,
  isOverdue,
  projectMemberDocId,
  type AdsMetricView,
  type ContentListFilters,
  type ContentStatus,
} from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"
import {
  pickCurrentMetric,
  toMetricView,
} from "@/modules/ads-performance/services/adsMetrics.server"
import { emitNotifications } from "@/modules/notifications/services/notificationEngine.server"

// Server-side content-pipeline operations (SPEC §5.2).

export async function loadContentItem(contentItemId: string) {
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

// Xoá vĩnh viễn một hạng mục và mọi dữ liệu treo vào nó. Ngoài phạm vi
// docs/SPEC.md — bổ sung theo yêu cầu người dùng (2026-09-09).
//
// Chỉ manager của dự án, và chỉ khi dự án còn ghi được. Cascade theo đúng mẫu
// của `deleteProject`: gom hết ref rồi xoá theo lô, doc hạng mục để cuối cùng
// nên nếu hỏng giữa chừng thì vẫn gọi lại được để dọn nốt.
export async function deleteContentItem(
  actor: AuthedUser,
  contentItemId: string,
  body: unknown
): Promise<{ id: string; docs_deleted: number }> {
  const { ref, data } = await loadContentItem(contentItemId)
  const scope = await requireProjectScope(actor.uid, data.project_id)
  requireProjectManager(scope)
  await assertProjectWritable(data.project_id)

  const { confirm_code } = parseOrThrow(contentItemDeleteSchema, body)
  if (confirm_code.trim() !== String(data.code ?? "").trim()) {
    throw new HttpError(400, "Mã xác nhận không khớp mã hạng mục")
  }

  // Kiểu cấu trúc thay vì kiểu của firebase-admin, giống `deleteProject`, để
  // test chạy được với fake db.
  type DeletableRef = { delete: () => unknown }
  const db = getAdminDb()
  const refs: DeletableRef[] = []

  for (const col of [
    COLLECTIONS.statusHistory,
    COLLECTIONS.comments,
    COLLECTIONS.adsBindings,
    COLLECTIONS.adsMetrics,
    COLLECTIONS.notifications,
  ]) {
    const snap = await db
      .collection(col)
      .where("content_item_id", "==", contentItemId)
      .get()
    refs.push(...snap.docs.map((d) => d.ref))
  }

  // referenceLinks dùng chung một collection, phân biệt bằng owner_type
  const linksSnap = await db
    .collection(COLLECTIONS.referenceLinks)
    .where("owner_type", "==", "content_item")
    .where("owner_id", "==", contentItemId)
    .get()
  refs.push(...linksSnap.docs.map((d) => d.ref))

  refs.push(ref)

  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch()
    for (const r of refs.slice(i, i + 450)) batch.delete(r as never)
    await batch.commit()
  }

  return { id: contentItemId, docs_deleted: refs.length }
}

// SPEC §5.4 R5: the "đánh giá / đề xuất" note is manager-only, and the write
// records who wrote it and when (`evaluation_by` / `evaluation_updated_at`,
// beyond the §6.1 sketch — same reason `updated_by` was added).
export async function setEvaluation(
  actor: AuthedUser,
  contentItemId: string,
  body: unknown
): Promise<{ id: string }> {
  const { ref, data } = await loadContentItem(contentItemId)
  const scope = await requireProjectScope(actor.uid, data.project_id)
  requireProjectManager(scope)
  await assertProjectWritable(data.project_id)

  const { evaluation } = parseOrThrow(evaluationUpdateSchema, body)

  await ref.update({
    evaluation,
    evaluation_by: actor.uid,
    evaluation_updated_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    updated_by: actor.uid,
  })
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

  await attachAdsMetrics(items)
  await attachAdsBindingFlag(items)
  await attachReferenceLinkCounts(items)

  return { items }
}

// campaign-page-reference-links task 4.4: the "Tài liệu" column shows how many
// reference links a content item has.
async function attachReferenceLinkCounts(
  items: ContentListItem[]
): Promise<void> {
  const ids = items.map((i) => i.id)
  if (ids.length === 0) return
  const db = getAdminDb()
  const count = new Map<string, number>()
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db
      .collection(COLLECTIONS.referenceLinks)
      .where("owner_type", "==", "content_item")
      .where("owner_id", "in", ids.slice(i, i + 30))
      .get()
    for (const d of snap.docs) {
      const key = String(d.data().owner_id ?? "")
      count.set(key, (count.get(key) ?? 0) + 1)
    }
  }
  for (const item of items) {
    item.reference_link_count = count.get(item.id) ?? 0
  }
}

// ads-overview-reporting task 6.1: the "Xem hiệu quả" button only shows for a
// content item that has at least one active ad-level AdsBinding.
async function attachAdsBindingFlag(items: ContentListItem[]): Promise<void> {
  const ids = items.map((i) => i.id)
  if (ids.length === 0) return
  const db = getAdminDb()
  const bound = new Set<string>()
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db
      .collection(COLLECTIONS.adsBindings)
      .where("content_item_id", "in", ids.slice(i, i + 30))
      .where("active", "==", true)
      .get()
    for (const d of snap.docs) {
      if (d.data().object_level === "ad") {
        bound.add(String(d.data().content_item_id ?? ""))
      }
    }
  }
  for (const item of items) {
    item.has_ads_binding = bound.has(item.id)
  }
}

// SPEC §5.4 R3 (task 5.10): the "báo cáo hiệu quả ads" cell shows the current
// figure — latest synced, else latest manual (§6.1) — so the list joins it in.
async function attachAdsMetrics(items: ContentListItem[]): Promise<void> {
  const ids = items.map((i) => i.id)
  if (ids.length === 0) return

  const db = getAdminDb()
  const byItem = new Map<string, AdsMetricView[]>()
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db
      .collection(COLLECTIONS.adsMetrics)
      .where("content_item_id", "in", ids.slice(i, i + 30))
      .get()
    for (const d of snap.docs) {
      const view = toMetricView(d.id, d.data())
      const key = String(d.data().content_item_id ?? "")
      ;(byItem.get(key) ?? byItem.set(key, []).get(key)!).push(view)
    }
  }

  for (const item of items) {
    item.ads_metric = pickCurrentMetric(byItem.get(item.id) ?? [])
  }
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
  // SPEC §5.7 R1: notify the assignee — the engine drops it when they claimed
  // the item themselves (actor === recipient).
  if (target !== null) {
    await emitNotifications(db, batch, {
      type: "content_assigned",
      project_id: projectId,
      content_item_id: contentItemId,
      actor_id: actor.uid,
      assignee_id: target,
      code: data.code ?? contentItemId,
    })
  }
  await batch.commit()

  return { id: contentItemId, assignee_id: target }
}
