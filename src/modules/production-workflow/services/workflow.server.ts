import { FieldValue } from "firebase-admin/firestore"

import { contentTransitionSchema, type ContentStatus } from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectManager,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import { WORK_STEP_KINDS, findTransition } from "@/lib/workflow/stateMachine"
import type { AuthedUser } from "@/lib/server/auth"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"
import { loadContentItem } from "@/modules/content-pipeline/services/content.server"

export interface TransitionResult {
  id: string
  from: ContentStatus
  to: ContentStatus
}

const LINK_LABEL: Record<"script_url" | "video_url", string> = {
  script_url: "link kịch bản",
  video_url: "link video",
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
//
// The "đã lên ads" special case (task 4.6), StatusHistory logging — where the
// return reason is persisted (task 4.7) — and event notifications (group 7.7)
// layer on next.
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

  await ref.update({
    status: to,
    updated_at: FieldValue.serverTimestamp(),
    updated_by: actor.uid,
  })

  return { id: contentItemId, from, to }
}
