import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  REFERENCE_LINK_WARN_COUNT,
  nextReferenceLinkSortIndex,
  referenceLinkCreateSchema,
  referenceLinkReorderSchema,
  referenceLinkUpdateSchema,
  reorderReferenceLinks,
  type ReferenceLinkOwnerType,
  type ReferenceLinkView,
} from "@/lib/domain"
import { requireProjectScope } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// campaign-page-reference-links, group 3. Labelled links on a project or a
// content item. The system only stores and returns the link — no Google API,
// no content fetch, no sync (design.md Decision 2 / §"Không đồng bộ").
//
// Permission (task 3.5): ANY member of the owning project may add / edit /
// delete — not manager-only. Enforced by resolving the owner to a project and
// calling requireProjectScope (throws 403 for a non-member).

type Db = ReturnType<typeof getAdminDb>

// owner_type + owner_id → the project id that governs access
async function ownerProjectId(
  db: Db,
  ownerType: ReferenceLinkOwnerType,
  ownerId: string
): Promise<string> {
  if (ownerType === "project") return ownerId
  const snap = await db.collection(COLLECTIONS.contentItems).doc(ownerId).get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy hạng mục")
  return String(snap.data()?.project_id ?? "")
}

function toView(id: string, d: Record<string, unknown>): ReferenceLinkView {
  return {
    id,
    owner_type: d.owner_type === "content_item" ? "content_item" : "project",
    owner_id: String(d.owner_id ?? ""),
    url: String(d.url ?? ""),
    label: String(d.label ?? ""),
    note: typeof d.note === "string" ? d.note : null,
    sort_index: Number(d.sort_index ?? 0),
  }
}

async function loadLink(db: Db, linkId: string) {
  const ref = db.collection(COLLECTIONS.referenceLinks).doc(linkId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy link")
  return { ref, data: snap.data() as Record<string, unknown> }
}

async function linksOfOwner(
  db: Db,
  ownerType: ReferenceLinkOwnerType,
  ownerId: string
) {
  const snap = await db
    .collection(COLLECTIONS.referenceLinks)
    .where("owner_type", "==", ownerType)
    .where("owner_id", "==", ownerId)
    .get()
  return snap.docs
    .map((d) => toView(d.id, d.data()))
    .sort((a, b) => a.sort_index - b.sort_index)
}

// ── list (task 3.3 / 3.6) ────────────────────────────────────────────────

export interface ReferenceLinkListResult {
  links: ReferenceLinkView[]
  /** task 3.6: soft warning past 20 — never blocks adding */
  over_warn_limit: boolean
}

export async function listReferenceLinks(
  actor: AuthedUser,
  ownerType: ReferenceLinkOwnerType,
  ownerId: string
): Promise<ReferenceLinkListResult> {
  const db = getAdminDb()
  await requireProjectScope(actor.uid, await ownerProjectId(db, ownerType, ownerId))
  const links = await linksOfOwner(db, ownerType, ownerId)
  return { links, over_warn_limit: links.length > REFERENCE_LINK_WARN_COUNT }
}

// ── add (task 3.1 / 3.4) ─────────────────────────────────────────────────

export async function addReferenceLink(
  actor: AuthedUser,
  body: unknown
): Promise<{ id: string; over_warn_limit: boolean }> {
  const input = parseOrThrow(referenceLinkCreateSchema, body)
  const db = getAdminDb()
  await requireProjectScope(
    actor.uid,
    await ownerProjectId(db, input.owner_type, input.owner_id)
  )

  const siblings = await linksOfOwner(db, input.owner_type, input.owner_id)
  const ref = db.collection(COLLECTIONS.referenceLinks).doc()
  await ref.set({
    owner_type: input.owner_type,
    owner_id: input.owner_id,
    url: input.url,
    label: input.label,
    note: input.note ?? null,
    created_by: actor.uid,
    created_at: FieldValue.serverTimestamp(),
    sort_index: nextReferenceLinkSortIndex(siblings.map((s) => s.sort_index)),
  })
  return {
    id: ref.id,
    over_warn_limit: siblings.length + 1 > REFERENCE_LINK_WARN_COUNT,
  }
}

// ── edit (task 3.2) ─────────────────────────────────────────────────────

export async function updateReferenceLink(
  actor: AuthedUser,
  linkId: string,
  body: unknown
): Promise<{ id: string }> {
  const input = parseOrThrow(referenceLinkUpdateSchema, body)
  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }
  const db = getAdminDb()
  const { ref, data } = await loadLink(db, linkId)
  await requireProjectScope(
    actor.uid,
    await ownerProjectId(
      db,
      data.owner_type === "content_item" ? "content_item" : "project",
      String(data.owner_id ?? "")
    )
  )
  await ref.update({ ...input })
  return { id: linkId }
}

export async function deleteReferenceLink(
  actor: AuthedUser,
  linkId: string
): Promise<{ id: string; removed: true }> {
  const db = getAdminDb()
  const { ref, data } = await loadLink(db, linkId)
  await requireProjectScope(
    actor.uid,
    await ownerProjectId(
      db,
      data.owner_type === "content_item" ? "content_item" : "project",
      String(data.owner_id ?? "")
    )
  )
  await ref.delete()
  return { id: linkId, removed: true }
}

// ── reorder (task 3.3) ──────────────────────────────────────────────────

export async function reorderReferenceLinkList(
  actor: AuthedUser,
  body: unknown
): Promise<{ ordered: number }> {
  const input = parseOrThrow(referenceLinkReorderSchema, body)
  const db = getAdminDb()
  await requireProjectScope(
    actor.uid,
    await ownerProjectId(db, input.owner_type, input.owner_id)
  )

  const current = await linksOfOwner(db, input.owner_type, input.owner_id)
  const known = new Set(current.map((l) => l.id))
  if (
    input.ordered_ids.length !== current.length ||
    input.ordered_ids.some((id) => !known.has(id))
  ) {
    throw new HttpError(
      400,
      "Danh sách thứ tự phải khớp đúng các link hiện có của chủ sở hữu"
    )
  }

  const batch = db.batch()
  for (const [id, sort_index] of reorderReferenceLinks(input.ordered_ids)) {
    batch.update(db.collection(COLLECTIONS.referenceLinks).doc(id), { sort_index })
  }
  await batch.commit()
  return { ordered: input.ordered_ids.length }
}
