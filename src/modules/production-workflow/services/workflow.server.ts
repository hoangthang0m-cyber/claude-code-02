import { FieldValue } from "firebase-admin/firestore"

import { contentTransitionSchema, type ContentStatus } from "@/lib/domain"
import {
  assertProjectWritable,
  requireProjectScope,
} from "@/lib/permissions/projectScope"
import { findTransition } from "@/lib/workflow/stateMachine"
import type { AuthedUser } from "@/lib/server/auth"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"
import { loadContentItem } from "@/modules/content-pipeline/services/content.server"

export interface TransitionResult {
  id: string
  from: ContentStatus
  to: ContentStatus
}

// SPEC §5.3 R1: every status change goes through here and is validated against
// the state machine server-side — an invalid transition is rejected and the
// status is left unchanged, even when the UI is bypassed.
//
// Role checks (assignee for work steps / manager for approvals, task 4.3-4.5),
// the required-link check (task 4.3), the "đã lên ads" special case (task 4.6)
// and StatusHistory logging (task 4.7) layer on top of this gate.
export async function executeTransition(
  actor: AuthedUser,
  contentItemId: string,
  body: unknown
): Promise<TransitionResult> {
  const { ref, data } = await loadContentItem(contentItemId)
  const projectId = data.project_id
  await requireProjectScope(actor.uid, projectId)
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
