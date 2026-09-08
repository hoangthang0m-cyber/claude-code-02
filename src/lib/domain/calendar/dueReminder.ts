import type { Timestamp } from "firebase/firestore"

import type {
  DueReminderStatus,
  ReminderChannel,
} from "@/lib/domain/calendar/enums"

// dueReminders/{reminderId} — the reminder queue (Mục C §5). Clients never read
// or write this collection; only route handlers and the send job, via
// firebase-admin (Mục C §6).
//
// Deterministic doc id (`dueReminderId`) makes the "recompute on item write"
// step idempotent — re-running it overwrites the same doc instead of
// duplicating (task 10.3 / 10.4).
export interface DueReminder {
  id: string
  itemId: string
  // "single" for a non-recurring item; "YYYY-MM-DD" (occurrence start, giờ VN)
  // for one instance of a recurring series.
  occurrenceKey: string
  recipientUids: string[] // assigneeIds ∪ { createdBy } (Mục B `calendar-reminders`)
  sendAt: Timestamp
  channel: ReminderChannel
  status: DueReminderStatus // "pending" | "sent" | "cancelled"
  // Snapshot taken at queue time so the notification renders correctly even if
  // the item is later edited or deleted (Mục C §1).
  title: string
  startAt: Timestamp
}

export const SINGLE_OCCURRENCE_KEY = "single"

export function dueReminderId(
  itemId: string,
  occurrenceKey: string,
  offsetMinutes: number
): string {
  return `${itemId}_${occurrenceKey}_${offsetMinutes}`
}

// Snooze presets (Mục B `calendar-reminders` — "VD 5 phút, 30 phút, 1 giờ").
export const SNOOZE_PRESETS_MINUTES: readonly number[] = [5, 30, 60]
