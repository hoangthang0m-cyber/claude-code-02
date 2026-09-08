import type { Firestore } from "firebase-admin/firestore"

import { SNOOZE_PRESETS_MINUTES } from "@/lib/domain/calendar"
import {
  loadNotification,
  markNotificationRead,
} from "@/lib/server/calendar/calendarNotifications"
import { snoozeReminder } from "@/lib/server/calendar/calendarReminders"
import { HttpError } from "@/lib/server/http"

// The snooze flow (Mục D task 10.6) sits above both notification and reminder
// stores, so it lives here rather than in either module (no import cycle).
// "bỏ nhắc 5'/30'/1h" → hide the current bell row + re-queue the reminder for
// the person who snoozed, `sendAt = now + minutes`.
export async function snoozeNotification(
  db: Firestore,
  uid: string,
  notifId: string,
  minutes: number
): Promise<{ sendAt: number }> {
  if (!SNOOZE_PRESETS_MINUTES.includes(minutes)) {
    throw new HttpError(400, "Khoảng bỏ nhắc không hợp lệ")
  }
  const n = await loadNotification(db, uid, notifId)
  if (n.kind !== "reminder") {
    throw new HttpError(400, "Chỉ bỏ nhắc được thông báo nhắc")
  }
  const result = await snoozeReminder(db, uid, {
    itemId: n.itemId,
    occurrenceKey: n.occurrenceKey,
    itemTitle: n.itemTitle,
    itemStartAtMs: n.itemStartAtMs,
    minutes,
  })
  await markNotificationRead(db, uid, notifId)
  return result
}
