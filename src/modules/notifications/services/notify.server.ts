import {
  FieldValue,
  type Firestore,
  type WriteBatch,
} from "firebase-admin/firestore"

import { COLLECTIONS, type NotificationType } from "@/lib/domain"

// The user ids of every manager of a project — the recipient set for most
// project-level events (SPEC §5.7 R1). Shared so comments, workflow and the ads
// jobs all resolve it the same way.
export async function projectManagerUids(
  db: Firestore,
  projectId: string
): Promise<string[]> {
  const snap = await db
    .collection(COLLECTIONS.projectMembers)
    .where("project_id", "==", projectId)
    .where("project_role", "==", "manager")
    .get()
  return snap.docs.map((d) => d.data().user_id as string)
}

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
