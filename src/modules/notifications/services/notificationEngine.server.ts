import { type Firestore, type WriteBatch } from "firebase-admin/firestore"

import {
  COLLECTIONS,
  NOTIFICATION_TYPE_GROUP,
  notificationPreferenceDocId,
  type NotificationType,
} from "@/lib/domain"
import {
  projectManagerUids,
  queueNotification,
} from "@/modules/notifications/services/notify.server"

// SPEC §5.7 R1, task 7.2: the one notification engine. Every place that raises a
// user-facing event calls `emitNotifications`; this module owns the event →
// recipient table and the "never notify the person who caused it" rule, so the
// call sites don't each re-derive the recipient set.
//
// Preference filtering (SPEC §5.7 R4) layers on in task 7.5 — the seam is the
// recipient list this module produces.

interface EventBase {
  project_id: string
  content_item_id?: string | null
  /** who caused the event — always removed from the recipients. `null` for a
   *  system event (a cron / sync job with no acting user). */
  actor_id: string | null
}

type ItemEvent = EventBase & { code: string }

export type NotificationEvent =
  // → the assignee
  | (ItemEvent & { type: "content_assigned"; assignee_id: string })
  | (ItemEvent & { type: "review_approved"; assignee_id: string | null })
  | (ItemEvent & {
      type: "review_returned"
      assignee_id: string | null
      reason?: string
    })
  // → the project managers
  | (ItemEvent & {
      type: "review_requested"
      to_status: "cho_duyet_kich_ban" | "cho_duyet_video"
    })
  | (ItemEvent & {
      type: "ads_stopped"
      delivery_status: "paused" | "completed"
    })
  // → the assignee + the project managers
  | (ItemEvent & { type: "content_overdue"; assignee_id: string | null })
  // → people involved with the item, minus whoever was already told
  | (ItemEvent & { type: "comment_added"; assignee_id: string | null; also_notified?: string[] })
  // → exactly the people named
  | (ItemEvent & { type: "comment_mention"; mentioned_ids: string[] })
  // → the project managers, with a caller-supplied message
  | (EventBase & { type: "sync_issue"; message: string })

// SPEC §5.7 R1 event → recipient table. Returns the raw recipient set BEFORE the
// actor is removed.
export async function notificationRecipients(
  db: Firestore,
  event: NotificationEvent
): Promise<Set<string>> {
  switch (event.type) {
    case "content_assigned":
      return new Set([event.assignee_id])

    case "review_approved":
    case "review_returned":
      return new Set(event.assignee_id ? [event.assignee_id] : [])

    case "review_requested":
    case "ads_stopped":
    case "sync_issue":
      return new Set(await projectManagerUids(db, event.project_id))

    case "content_overdue": {
      const set = new Set(await projectManagerUids(db, event.project_id))
      if (event.assignee_id) set.add(event.assignee_id)
      return set
    }

    case "comment_added": {
      const set = new Set(await projectManagerUids(db, event.project_id))
      if (event.assignee_id) set.add(event.assignee_id)
      for (const uid of event.also_notified ?? []) set.delete(uid)
      return set
    }

    case "comment_mention":
      return new Set(event.mentioned_ids)
  }
}

export function notificationMessage(event: NotificationEvent): string {
  switch (event.type) {
    case "content_assigned":
      return `Bạn được giao hạng mục ${event.code}`
    case "review_requested":
      return event.to_status === "cho_duyet_kich_ban"
        ? `Hạng mục ${event.code} đang chờ duyệt kịch bản`
        : `Hạng mục ${event.code} đang chờ duyệt video`
    case "review_approved":
      return `Hạng mục ${event.code} đã được duyệt`
    case "review_returned":
      return event.reason
        ? `Hạng mục ${event.code} bị trả lại: ${event.reason}`
        : `Hạng mục ${event.code} bị trả lại`
    case "content_overdue":
      return `Hạng mục ${event.code} đã quá hạn`
    case "ads_stopped":
      return `Ads của hạng mục ${event.code} đã ${
        event.delivery_status === "paused" ? "tạm dừng" : "hoàn tất"
      }`
    case "comment_added":
      return `Bình luận mới trên hạng mục ${event.code}`
    case "comment_mention":
      return `Bạn được nhắc tên trong bình luận ở hạng mục ${event.code}`
    case "sync_issue":
      return event.message
  }
}

// SPEC §5.7 R4, task 7.5: drop recipients who turned this event's group off.
// Opt-out model — one `notificationPreferences/${uid}__${group}` row, absent or
// `enabled: true` means keep.
async function filterByPreference(
  db: Firestore,
  uids: string[],
  type: NotificationType
): Promise<string[]> {
  const group = NOTIFICATION_TYPE_GROUP[type]
  const checks = await Promise.all(
    uids.map(async (uid) => {
      const snap = await db
        .collection(COLLECTIONS.notificationPreferences)
        .doc(notificationPreferenceDocId(uid, group))
        .get()
      return snap.exists && snap.data()?.enabled === false ? null : uid
    })
  )
  return checks.filter((uid): uid is string => uid != null)
}

// Resolve the recipients, drop the actor + blanks + anyone who muted this
// group, and queue one Notification per remaining recipient into `batch`.
// Returns who was notified.
export async function emitNotifications(
  db: Firestore,
  batch: WriteBatch,
  event: NotificationEvent
): Promise<{ recipients: string[] }> {
  const recipients = await notificationRecipients(db, event)
  if (event.actor_id) recipients.delete(event.actor_id)
  recipients.delete("")

  const message = notificationMessage(event)
  const type: NotificationType = event.type
  const list = await filterByPreference(db, [...recipients], type)
  for (const uid of list) {
    queueNotification(db, batch, {
      recipient_id: uid,
      type,
      content_item_id: event.content_item_id ?? null,
      project_id: event.project_id,
      message,
    })
  }
  return { recipients: list }
}
