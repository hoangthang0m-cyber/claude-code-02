import type { Timestamp } from "firebase/firestore"

export function formatDate(timestamp?: Timestamp): string {
  if (!timestamp) return "—"
  return timestamp.toDate().toLocaleDateString("vi-VN")
}

export function isOverdue(dueDate: Timestamp | undefined, isDone: boolean): boolean {
  if (!dueDate || isDone) return false
  return dueDate.toMillis() < Date.now()
}
