import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  REFERENCE_LINK_WARN_COUNT,
  isKnowledgeEntryWritable,
  knowledgeEntryCreateSchema,
  knowledgeEntryDeleteSchema,
  knowledgeEntryLifecycleSchema,
  knowledgeEntryUpdateSchema,
  knowledgeLinkCreateSchema,
  knowledgeLinkReorderSchema,
  knowledgeLinkUpdateSchema,
  knowledgeProjectRefCreateSchema,
  nextReferenceLinkSortIndex,
  reorderReferenceLinks,
  type KnowledgeLifecycle,
  type KnowledgeLinkSection,
} from "@/lib/domain"
import { requireSystemManager } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// knowledge-base — server operations for the org knowledge base. Content writes
// (entry create/edit, links, refs) only need a signed-in user (design.md
// Decision 4); the destructive/state ops (delete, lifecycle) call
// `requireSystemManager`. The route handlers enforce auth; the client only
// reads (via onSnapshot).

type Db = ReturnType<typeof getAdminDb>

// ── shared loaders ────────────────────────────────────────────────────────

async function loadEntry(db: Db, entryId: string) {
  const ref = db.collection(COLLECTIONS.knowledgeEntries).doc(entryId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy tri thức")
  return { ref, data: snap.data() as Record<string, unknown> }
}

// A mutation of an entry's content / links / refs is rejected once it's archived.
async function requireWritableEntry(db: Db, entryId: string) {
  const loaded = await loadEntry(db, entryId)
  if (!isKnowledgeEntryWritable(loaded.data.lifecycle as string | undefined)) {
    throw new HttpError(409, "Tri thức đã lưu trữ — chỉ đọc")
  }
  return loaded
}

async function loadLink(db: Db, linkId: string) {
  const ref = db.collection(COLLECTIONS.knowledgeLinks).doc(linkId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy link")
  return { ref, data: snap.data() as Record<string, unknown> }
}

async function linksOfSection(
  db: Db,
  entryId: string,
  section: KnowledgeLinkSection
): Promise<Array<{ id: string; sort_index: number }>> {
  const snap = await db
    .collection(COLLECTIONS.knowledgeLinks)
    .where("entry_id", "==", entryId)
    .where("section", "==", section)
    .get()
  return snap.docs
    .map((d) => ({ id: d.id, sort_index: Number(d.data().sort_index ?? 0) }))
    .sort((a, b) => a.sort_index - b.sort_index)
}

// ── entry CRUD + lifecycle (group 2) ──────────────────────────────────────

// task 2.1 — create. Any signed-in member; lifecycle starts "active".
export async function createKnowledgeEntry(
  actor: AuthedUser,
  body: unknown
): Promise<{ id: string }> {
  const input = parseOrThrow(knowledgeEntryCreateSchema, body)
  const ref = getAdminDb().collection(COLLECTIONS.knowledgeEntries).doc()
  await ref.set({
    name: input.name,
    overview: input.overview,
    detail_note: input.detail_note ?? null,
    process_note: input.process_note ?? null,
    conclusion_note: input.conclusion_note ?? null,
    lifecycle: "active",
    created_by: actor.uid,
    created_at: FieldValue.serverTimestamp(),
    updated_by: actor.uid,
    updated_at: FieldValue.serverTimestamp(),
  })
  return { id: ref.id }
}

// task 2.2 — edit content. Any member; 404 missing; 409 archived; 400 empty body.
export async function updateKnowledgeEntry(
  actor: AuthedUser,
  entryId: string,
  body: unknown
): Promise<{ id: string }> {
  const input = parseOrThrow(knowledgeEntryUpdateSchema, body)
  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }
  const db = getAdminDb()
  const { ref } = await requireWritableEntry(db, entryId)
  await ref.update({
    ...input,
    updated_by: actor.uid,
    updated_at: FieldValue.serverTimestamp(),
  })
  return { id: entryId }
}

// task 2.3 — archive / restore. Manager only.
export async function setKnowledgeEntryLifecycle(
  actor: AuthedUser,
  entryId: string,
  body: unknown
): Promise<{ id: string; lifecycle: KnowledgeLifecycle }> {
  requireSystemManager(actor)
  const { lifecycle: target } = parseOrThrow(knowledgeEntryLifecycleSchema, body)
  const db = getAdminDb()
  const { ref, data } = await loadEntry(db, entryId)
  if ((data.lifecycle as KnowledgeLifecycle | undefined) === target) {
    throw new HttpError(400, `Tri thức đã ở trạng thái "${target}"`)
  }
  await ref.update({ lifecycle: target })
  return { id: entryId, lifecycle: target }
}

// task 2.4 — hard delete + cascade. Manager only; must echo the exact name.
export async function deleteKnowledgeEntry(
  actor: AuthedUser,
  entryId: string,
  body: unknown
): Promise<{ id: string; links_removed: number; refs_removed: number }> {
  requireSystemManager(actor)
  const { confirm_name } = parseOrThrow(knowledgeEntryDeleteSchema, body)
  const db = getAdminDb()
  const { ref, data } = await loadEntry(db, entryId)
  if (confirm_name.trim() !== String(data.name ?? "").trim()) {
    throw new HttpError(400, "Tên không khớp — đã huỷ")
  }

  const [links, refs] = await Promise.all([
    db.collection(COLLECTIONS.knowledgeLinks).where("entry_id", "==", entryId).get(),
    db
      .collection(COLLECTIONS.knowledgeProjectRefs)
      .where("entry_id", "==", entryId)
      .get(),
  ])

  const batch = db.batch()
  links.docs.forEach((d) => batch.delete(d.ref))
  refs.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(ref)
  await batch.commit()

  return { id: entryId, links_removed: links.size, refs_removed: refs.size }
}

// ── section links (group 3) ───────────────────────────────────────────────

// task 3.1 — add a link to one section. `sort_index` appended within the
// (entry, section) bucket; `over_warn_limit` when the section passes 20.
export async function addKnowledgeLink(
  actor: AuthedUser,
  entryId: string,
  body: unknown
): Promise<{ id: string; over_warn_limit: boolean }> {
  const input = parseOrThrow(knowledgeLinkCreateSchema, body)
  const db = getAdminDb()
  await requireWritableEntry(db, entryId)

  const siblings = await linksOfSection(db, entryId, input.section)
  const ref = db.collection(COLLECTIONS.knowledgeLinks).doc()
  await ref.set({
    entry_id: entryId,
    section: input.section,
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

// task 3.2 — edit / remove a link. Any member; archived entry → 409.
export async function updateKnowledgeLink(
  linkId: string,
  body: unknown
): Promise<{ id: string }> {
  const input = parseOrThrow(knowledgeLinkUpdateSchema, body)
  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }
  const db = getAdminDb()
  const { ref, data } = await loadLink(db, linkId)
  await requireWritableEntry(db, String(data.entry_id ?? ""))
  await ref.update({ ...input })
  return { id: linkId }
}

export async function deleteKnowledgeLink(
  linkId: string
): Promise<{ id: string; removed: true }> {
  const db = getAdminDb()
  const { ref, data } = await loadLink(db, linkId)
  await requireWritableEntry(db, String(data.entry_id ?? ""))
  await ref.delete()
  return { id: linkId, removed: true }
}

// task 3.3 — reorder one section's links. `ordered_ids` must be the exact set.
export async function reorderKnowledgeLinks(
  actor: AuthedUser,
  entryId: string,
  body: unknown
): Promise<{ ordered: number }> {
  const input = parseOrThrow(knowledgeLinkReorderSchema, body)
  const db = getAdminDb()
  await requireWritableEntry(db, entryId)

  const current = await linksOfSection(db, entryId, input.section)
  const known = new Set(current.map((l) => l.id))
  if (
    input.ordered_ids.length !== current.length ||
    input.ordered_ids.some((id) => !known.has(id))
  ) {
    throw new HttpError(
      400,
      "Danh sách thứ tự phải khớp đúng các link hiện có của đầu mục"
    )
  }

  const batch = db.batch()
  for (const [id, sort_index] of reorderReferenceLinks(input.ordered_ids)) {
    batch.update(db.collection(COLLECTIONS.knowledgeLinks).doc(id), { sort_index })
  }
  await batch.commit()
  return { ordered: input.ordered_ids.length }
}

// ── project / group references (group 4) ──────────────────────────────────

// task 4.1 — attach a Project / ProjectGroup reference to "Quá trình đúc kết".
// The target must exist; `ref_name` is snapshotted from the target doc.
export async function addKnowledgeProjectRef(
  actor: AuthedUser,
  entryId: string,
  body: unknown
): Promise<{ id: string; ref_name: string }> {
  const input = parseOrThrow(knowledgeProjectRefCreateSchema, body)
  const db = getAdminDb()
  await requireWritableEntry(db, entryId)

  const targetCol =
    input.ref_type === "project_group"
      ? COLLECTIONS.projectGroups
      : COLLECTIONS.projects
  const target = await db.collection(targetCol).doc(input.ref_id).get()
  if (!target.exists) {
    throw new HttpError(
      404,
      input.ref_type === "project_group"
        ? "Không tìm thấy nhóm dự án"
        : "Không tìm thấy dự án"
    )
  }
  const ref_name = String(target.data()?.name ?? input.ref_id)

  const siblings = await db
    .collection(COLLECTIONS.knowledgeProjectRefs)
    .where("entry_id", "==", entryId)
    .get()
  const indices = siblings.docs.map((d) => Number(d.data().sort_index ?? 0))

  const ref = db.collection(COLLECTIONS.knowledgeProjectRefs).doc()
  await ref.set({
    entry_id: entryId,
    ref_type: input.ref_type,
    ref_id: input.ref_id,
    ref_name,
    note: input.note ?? null,
    created_by: actor.uid,
    created_at: FieldValue.serverTimestamp(),
    sort_index: nextReferenceLinkSortIndex(indices),
  })
  return { id: ref.id, ref_name }
}

// task 4.2 — detach a reference. Any member; the target Project/Group is untouched.
export async function deleteKnowledgeProjectRef(
  refId: string
): Promise<{ id: string; removed: true }> {
  const db = getAdminDb()
  const ref = db.collection(COLLECTIONS.knowledgeProjectRefs).doc(refId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy tham chiếu")
  await ref.delete()
  return { id: refId, removed: true }
}
