import type { Timestamp } from "firebase/firestore"

import type { CalendarNotificationKind } from "@/lib/domain/calendar/enums"

// calendarNotifications/{uid}/items/{notifId} — one row in a person's in-app bell
// feed (Mục B `item-assignees` "Thông báo khi được giao/gỡ" + `calendar-reminders`
// "Gửi nhắc qua chuông in-app"). Written only by the server (the item-write path
// for assign/unassign, the send job for reminders); the owner reads their own
// feed via onSnapshot and marks rows read through /api/calendar-notifications
// (Mục C §6 — "mọi ghi qua server").
export interface CalendarNotification {
  id: string
  recipientUid: string
  kind: CalendarNotificationKind
  itemId: string
  // null for a non-recurring item; "YYYY-MM-DD" (giờ VN) for one occurrence.
  occurrenceKey: string | null
  // Snapshot at queue time so the row still renders after the item is edited /
  // deleted.
  itemTitle: string
  itemStartAt: Timestamp
  message: string
  readAt: Timestamp | null
  createdAt: Timestamp
}

// Bell copy (Mục B wording). `title` is the item title, already display-safe.
export function calendarNotificationMessage(
  kind: CalendarNotificationKind,
  title: string
): string {
  switch (kind) {
    case "assigned":
      return `Bạn được giao: ${title}`
    case "unassigned":
      return `Bạn không còn đảm nhận: ${title}`
    case "reminder":
      return `Sắp tới: ${title}`
  }
}

// The union of an item's assignees and its creator — everyone who gets a reminder
// (Mục B `calendar-reminders` "Người nhận nhắc": assignees ∪ creator; creator
// only when unassigned).
export function reminderRecipientUids(
  assigneeIds: readonly string[],
  createdBy: string
): string[] {
  return [...new Set([...assigneeIds, createdBy])].filter(Boolean)
}

// sendAt for one reminder offset (Mục C §5 — `sendAt = startAt - offset`).
export function reminderSendAtMs(startMs: number, offsetMinutes: number): number {
  return startMs - offsetMinutes * 60_000
}
