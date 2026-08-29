import { FieldValue } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  contentTransitionSchema,
  type ContentStatus,
} from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import { WORK_STEP_KINDS, findTransition } from "@/lib/workflow/stateMachine"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"
import { loadContentItem } from "@/modules/content-pipeline/services/content.server"
import { emitNotifications } from "@/modules/notifications/services/notificationEngine.server"

export interface TransitionResult {
  id: string
  from: ContentStatus
  to: ContentStatus
  /** SPEC §5.3 R4: set when "đã lên ads" was confirmed manually with no ads
   *  binding — the UI nudges the manager to attach a campaign for auto metrics. */
  reminder?: "attach_campaign"
}

const LINK_LABEL: Record<"script_url" | "video_url", string> = {
  script_url: "link kịch bản",
  video_url: "link video",
}

// Does this content item have at least one ads binding? (SPEC §5.3 R4 path A.)
// AdsBinding has no state field yet — task 5.3 adds the "stopped updating"
// marker, at which point this should exclude stopped bindings.
async function hasAdsBinding(contentItemId: string): Promise<boolean> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.adsBindings)
    .where("content_item_id", "==", contentItemId)
    .limit(1)
    .get()
  return !snap.empty
}

// SPEC §5.3 R1: every status change goes through here and is validated against
// the state machine server-side — an invalid transition is rejected and the
// status is left unchanged, even when the UI is bypassed.
//
// Layered on the state-machine gate:
//  - work-step transitions (advance / submit) belong to the person doing the
//    work — only the item's assignee may run them (SPEC §2 role table, §5.3
//    R1/R2) — task 4.3
//  - a submit for review needs the matching link (script_url / video_url)
//    already filled (SPEC §5.3 R2) — task 4.3
//  - approve (cho_duyet_* → bước sau) and return (cho_duyet_* → bước trước)
//    are project-manager actions only, and a return needs a reason
//    (SPEC §2 role table, §5.3 R3) — tasks 4.4 / 4.5
//  - publish (da_duyet → da_len_ads) is a manager action allowed when the item
//    has an ads binding OR the manager confirms manually (SPEC §5.3 R4) —
//    task 4.6
//  - every applied transition writes a StatusHistory row in the same batch
//    (SPEC §5.3 R5) — task 4.7
//
// Event notifications (group 7.7) layer on next.
export async function executeTransition(
  actor: AuthedUser,
  contentItemId: string,
  body: unknown
): Promise<TransitionResult> {
  const { ref, data } = await loadContentItem(contentItemId)
  const projectId = data.project_id
  const scope = await requireProjectScope(actor.uid, projectId)
  await assertProjectWritable(projectId)

  const input = parseOrThrow(contentTransitionSchema, body)
  const from = data.status as ContentStatus
  const to = input.to

  const transition = findTransition(from, to)
  if (!transition) {
    throw new HttpError(
      409,
      `Không thể chuyển trạng thái từ "${from}" sang "${to}"`
    )
  }

  // SPEC §2 role table / §5.3 R1: work steps (viết → chờ duyệt, quay → chờ
  // duyệt) belong to the assignee. An unassigned item has no "người thực hiện"
  // and cannot be moved forward until it is assigned.
  if (WORK_STEP_KINDS.has(transition.kind) && data.assignee_id !== actor.uid) {
    throw new HttpError(
      403,
      "Chỉ người thực hiện hạng mục mới được chuyển bước làm việc này"
    )
  }

  // SPEC §2 role table / §5.3 R3: approving or returning a pending item (duyệt
  // / trả lại kịch bản, video) is a project-manager action.
  if (transition.kind === "approve" || transition.kind === "return") {
    requireProjectManager(scope)
  }

  // SPEC §5.3 R2: a submit for review needs the matching link already filled.
  if (transition.requiresLink) {
    const link = data[transition.requiresLink]
    if (typeof link !== "string" || link.trim() === "") {
      throw new HttpError(
        400,
        `Cần dán ${LINK_LABEL[transition.requiresLink]} trước khi gửi duyệt`
      )
    }
  }

  // SPEC §5.3 R3: a return needs a reason.
  if (transition.requiresReason && !input.reason) {
    throw new HttpError(400, "Trả lại cần nhập lý do")
  }

  // SPEC §5.3 R4: "đã lên ads" is a manager action, allowed either because the
  // item is bound to a Meta campaign/ad or because the manager confirms it by
  // hand (`confirm: true`). Confirming without a binding returns a reminder to
  // attach a campaign so metrics sync automatically.
  let reminder: TransitionResult["reminder"]
  if (transition.kind === "publish") {
    requireProjectManager(scope)
    if (!(await hasAdsBinding(contentItemId))) {
      if (input.confirm !== true) {
        throw new HttpError(
          400,
          "Hạng mục chưa gắn campaign/ad Meta — gắn campaign hoặc xác nhận thủ công (confirm: true)"
        )
      }
      reminder = "attach_campaign"
    }
  }

  const db = getAdminDb()
  const batch = db.batch()
  batch.update(ref, {
    status: to,
    updated_at: FieldValue.serverTimestamp(),
    updated_by: actor.uid,
  })

  // SPEC §5.3 R5: log every transition (from/to, actor, reason on a return,
  // timestamp), separate from comments. Written in the same batch as the status
  // change so the item and its history never disagree.
  const historyEntry: Record<string, unknown> = {
    content_item_id: contentItemId,
    from_status: from,
    to_status: to,
    actor_id: actor.uid,
    created_at: FieldValue.serverTimestamp(),
  }
  if (transition.requiresReason && input.reason) {
    historyEntry.reason = input.reason
  }
  batch.set(db.collection(COLLECTIONS.statusHistory).doc(), historyEntry)

  // SPEC §5.7 R1: submit for review → the project managers; approve / return →
  // the assignee. Queued in the same batch as the status change + history row.
  const code = data.code ?? contentItemId
  if (transition.kind === "submit") {
    await emitNotifications(db, batch, {
      type: "review_requested",
      project_id: projectId,
      content_item_id: contentItemId,
      actor_id: actor.uid,
      code,
      to_status: to as "cho_duyet_kich_ban" | "cho_duyet_video",
    })
  } else if (transition.kind === "approve") {
    await emitNotifications(db, batch, {
      type: "review_approved",
      project_id: projectId,
      content_item_id: contentItemId,
      actor_id: actor.uid,
      code,
      assignee_id: data.assignee_id ?? null,
    })
  } else if (transition.kind === "return") {
    await emitNotifications(db, batch, {
      type: "review_returned",
      project_id: projectId,
      content_item_id: contentItemId,
      actor_id: actor.uid,
      code,
      assignee_id: data.assignee_id ?? null,
      reason: input.reason,
    })
  }

  await batch.commit()

  return reminder
    ? { id: contentItemId, from, to, reminder }
    : { id: contentItemId, from, to }
}

export interface StatusHistoryEntry {
  id: string
  content_item_id: string
  from_status: ContentStatus
  to_status: ContentStatus
  actor_id: string
  reason?: string
  created_at: unknown
}

function toMillis(value: unknown): number {
  const t = value as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : 0
}

// SPEC §5.3 R5: the item's transition log, oldest first (the order the history
// tab renders). Any project member can read it; sorted in memory to avoid a
// composite index (same approach as the content list and comments).
export async function listStatusHistory(
  actor: AuthedUser,
  contentItemId: string
): Promise<{ entries: StatusHistoryEntry[] }> {
  const { data } = await loadContentItem(contentItemId)
  await requireProjectScope(actor.uid, data.project_id)

  const snap = await getAdminDb()
    .collection(COLLECTIONS.statusHistory)
    .where("content_item_id", "==", contentItemId)
    .get()

  const entries = snap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<StatusHistoryEntry, "id">),
    }))
    .sort((a, b) => toMillis(a.created_at) - toMillis(b.created_at))

  return { entries }
}
