import {
  COLLECTIONS,
  isContentItemDone,
  isProjectWritable,
  projectMemberAddSchema,
  projectMemberDocId,
  projectMemberUpdateSchema,
  type ContentStatus,
  type ProjectLifecycle,
} from "@/lib/domain"
import {
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminAuth, getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// Project membership management (SPEC §5.1 R4). Manager of the project only, and
// only while the project is writable (not archived, §5.1 R3).

type Db = ReturnType<typeof getAdminDb>

async function requireManagerOfWritableProject(
  actor: AuthedUser,
  projectId: string
): Promise<Db> {
  const scope = await requireProjectScope(actor.uid, projectId)
  requireProjectManager(scope)

  const db = getAdminDb()
  const project = await db.collection(COLLECTIONS.projects).doc(projectId).get()
  if (!project.exists) {
    throw new HttpError(404, "Không tìm thấy dự án")
  }
  if (!isProjectWritable((project.data()?.lifecycle as ProjectLifecycle) ?? "running")) {
    throw new HttpError(409, "Dự án đã lưu trữ — chỉ đọc")
  }
  return db
}

// A project must always keep at least one manager (SPEC §6.8: don't depend on a
// single person). Throws if `memberId` is the only manager.
async function assertNotLastManager(
  db: Db,
  projectId: string,
  memberId: string
): Promise<void> {
  const managers = await db
    .collection(COLLECTIONS.projectMembers)
    .where("project_id", "==", projectId)
    .where("project_role", "==", "manager")
    .get()
  const remaining = managers.docs.filter((d) => d.id !== memberId)
  if (remaining.length === 0) {
    throw new HttpError(409, "Dự án phải còn ít nhất một Trưởng phòng")
  }
}

export async function addProjectMember(
  actor: AuthedUser,
  projectId: string,
  body: unknown
): Promise<{ id: string }> {
  const db = await requireManagerOfWritableProject(actor, projectId)
  const input = parseOrThrow(projectMemberAddSchema, body)

  try {
    await getAdminAuth().getUser(input.user_id)
  } catch {
    throw new HttpError(404, "Không tìm thấy người dùng này")
  }

  const ref = db
    .collection(COLLECTIONS.projectMembers)
    .doc(projectMemberDocId(projectId, input.user_id))
  if ((await ref.get()).exists) {
    throw new HttpError(409, "Người này đã là thành viên dự án")
  }

  await ref.set({
    project_id: projectId,
    user_id: input.user_id,
    project_role: input.project_role,
    skill_tag: input.skill_tag,
  })
  return { id: ref.id }
}

async function getMemberOfProject(db: Db, projectId: string, memberId: string) {
  const ref = db.collection(COLLECTIONS.projectMembers).doc(memberId)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.project_id !== projectId) {
    throw new HttpError(404, "Không tìm thấy thành viên trong dự án này")
  }
  return { ref, data: snap.data() as { user_id: string; project_role: string } }
}

export async function updateProjectMember(
  actor: AuthedUser,
  projectId: string,
  memberId: string,
  body: unknown
): Promise<{ id: string }> {
  const db = await requireManagerOfWritableProject(actor, projectId)
  const input = parseOrThrow(projectMemberUpdateSchema, body)
  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }

  const { ref, data } = await getMemberOfProject(db, projectId, memberId)

  if (input.project_role === "staff" && data.project_role === "manager") {
    await assertNotLastManager(db, projectId, memberId)
  }

  await ref.update({ ...input })
  return { id: memberId }
}

export async function removeProjectMember(
  actor: AuthedUser,
  projectId: string,
  memberId: string
): Promise<{ id: string; removed: true }> {
  const db = await requireManagerOfWritableProject(actor, projectId)
  const { ref, data } = await getMemberOfProject(db, projectId, memberId)

  if (data.project_role === "manager") {
    await assertNotLastManager(db, projectId, memberId)
  }

  // SPEC §5.1 R4: block removal while this member is the assignee of an
  // unfinished content item — force a reassignment first.
  const assigned = await db
    .collection(COLLECTIONS.contentItems)
    .where("project_id", "==", projectId)
    .where("assignee_id", "==", data.user_id)
    .get()
  const blocking = assigned.docs.filter(
    (d) => !isContentItemDone(d.data().status as ContentStatus)
  )
  if (blocking.length > 0) {
    throw new HttpError(
      409,
      `Không thể gỡ: còn ${blocking.length} hạng mục chưa hoàn thành do người này thực hiện. ` +
        "Gán lại người thực hiện trước khi gỡ."
    )
  }

  await ref.delete()
  return { id: memberId, removed: true }
}
