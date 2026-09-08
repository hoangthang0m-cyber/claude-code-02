import { authedJson } from "@/lib/api/authedFetch"

// Client wrappers for the calendar bell's write side (Mục D tasks 10.6 / 10.8).
// The feed itself is read with onSnapshot (useCalendarNotifications); only the
// mutations go through /api because `calendarNotifications` is server-owned.

export function markCalendarNotificationRead(
  notifId: string
): Promise<{ id: string; readAt: number }> {
  return authedJson(`/api/calendar-notifications/${notifId}/read`, {
    method: "POST",
  })
}

export function markAllCalendarNotificationsRead(): Promise<{ marked: number }> {
  return authedJson("/api/calendar-notifications/read-all", { method: "POST" })
}

export function snoozeCalendarNotification(
  notifId: string,
  minutes: number
): Promise<{ sendAt: number }> {
  return authedJson(`/api/calendar-notifications/${notifId}/snooze`, {
    method: "POST",
    body: JSON.stringify({ minutes }),
  })
}
