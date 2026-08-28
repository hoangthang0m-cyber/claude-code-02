import {
  FieldValue,
  type Firestore,
  type WriteBatch,
} from "firebase-admin/firestore"

import { COLLECTIONS, type NotificationType } from "@/lib/domain"

// Minimal notification writer (SPEC §5.7). Group 7.7 wraps this in the full
// engine (the event → recipient table + per-group preferences); until then,
// individual handlers queue notifications through here.

export interface NotificationInput {
  recipient_id: string
  type: NotificationType
  message: string
  content_item_id?: string | null
  project_id?: string | null
}

export function notificationDoc(input: NotificationInput) {
  return {
    recipient_id: input.recipient_id,
    type: input.type,
    message: input.message,
    content_item_id: input.content_item_id ?? null,
    project_id: input.project_id ?? null,
    read_at: null,
    created_at: FieldValue.serverTimestamp(),
  }
}

// Adds a notification write to an existing batch (keeps it atomic with the
// change that triggered it).
export function queueNotification(
  db: Firestore,
  batch: WriteBatch,
  input: NotificationInput
): void {
  batch.set(db.collection(COLLECTIONS.notifications).doc(), notificationDoc(input))
}
