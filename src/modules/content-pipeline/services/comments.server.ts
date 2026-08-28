import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  commentCreateSchema,
  projectMemberDocId,
  type Comment,
} from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"
import { loadContentItem } from "@/modules/content-pipeline/services/content.server"
import {
  projectManagerUids,
  queueNotification,
} from "@/modules/notifications/services/notify.server"

// SPEC §5.2 R5: free-text comments on a content item, separate from
// StatusHistory. Commenters = the assignee, project managers, or anyone
// previously @mentioned on this item. @mentions are limited to project members
// (SPEC §8 Q2).

async function priorMentionUids(
  contentItemId: string
): Promise<Set<string>> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.comments)
    .where("content_item_id", "==", contentItemId)
    .get()
  const uids = new Set<string>()
  snap.forEach((d) => {
    for (const uid of (d.data().mentions as string[]) ?? []) uids.add(uid)
  })
  return uids
}

export async function listComments(
  actor: AuthedUser,
  contentItemId: string
): Promise<{ comments: Comment[] }> {
  const { data } = await loadContentItem(contentItemId)
  await requireProjectScope(actor.uid, data.project_id)

  const snap = await getAdminDb()
    .collection(COLLECTIONS.comments)
    .where("content_item_id", "==", contentItemId)
    .get()

  const comments = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) }))
    .sort(
      (a, b) =>
        (a.created_at?.toMillis?.() ?? 0) - (b.created_at?.toMillis?.() ?? 0)
    )
  return { comments }
}

export async function createComment(
  actor: AuthedUser,
  contentItemId: string,
  body: unknown
): Promise<{ id: string }> {
  const { data: item } = await loadContentItem(contentItemId)
  const projectId = item.project_id
  const scope = await requireProjectScope(actor.uid, projectId)
  await assertProjectWritable(projectId)

  const input = parseOrThrow(commentCreateSchema, body)
  const db = getAdminDb()

  // Who may comment (SPEC §5.2 R5).
  if (!scope.is_manager && item.assignee_id !== actor.uid) {
    const mentioned = await priorMentionUids(contentItemId)
    if (!mentioned.has(actor.uid)) {
      throw new HttpError(
        403,
        "Chỉ người thực hiện, Trưởng phòng hoặc người được nhắc tên mới bình luận được"
      )
    }
  }

  // Every mention must be a project member (SPEC §8 Q2).
  const uniqueMentions = [...new Set(input.mentions)]
  await Promise.all(
    uniqueMentions.map(async (uid) => {
      const m = await db
        .collection(COLLECTIONS.projectMembers)
        .doc(projectMemberDocId(projectId, uid))
        .get()
      if (!m.exists) {
        throw new HttpError(400, "Chỉ nhắc tên được thành viên dự án")
      }
    })
  )

  const commentRef = db.collection(COLLECTIONS.comments).doc()
  const batch = db.batch()
  batch.set(commentRef, {
    content_item_id: contentItemId,
    author_id: actor.uid,
    body: input.body,
    mentions: uniqueMentions,
    created_at: FieldValue.serverTimestamp(),
  })

  const code = item.code ?? contentItemId
  const mentionSet = new Set(uniqueMentions.filter((u) => u !== actor.uid))

  // @mention → the mentioned person (SPEC §5.7 R1).
  for (const uid of mentionSet) {
    queueNotification(db, batch, {
      recipient_id: uid,
      type: "comment_mention",
      content_item_id: contentItemId,
      project_id: projectId,
      message: `Bạn được nhắc tên trong bình luận ở hạng mục ${code}`,
    })
  }

  // New comment → people involved with the item, minus the author and anyone
  // already notified via a mention (SPEC §5.7 R1).
  const involved = new Set<string>(await projectManagerUids(db, projectId))
  if (item.assignee_id) involved.add(item.assignee_id)
  involved.delete(actor.uid)
  for (const uid of mentionSet) involved.delete(uid)

  for (const uid of involved) {
    queueNotification(db, batch, {
      recipient_id: uid,
      type: "comment_added",
      content_item_id: contentItemId,
      project_id: projectId,
      message: `Bình luận mới trên hạng mục ${code}`,
    })
  }

  await batch.commit()
  return { id: commentRef.id }
}
