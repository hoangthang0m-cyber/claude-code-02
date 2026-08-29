import { authedJson } from "@/lib/api/authedFetch"
import type { NotificationType } from "@/lib/domain"

// Client wrapper for the notification bell APIs (SPEC §5.7 R2, task 7.3).

export interface NotificationView {
  id: string
  type: NotificationType
  message: string
  content_item_id: string | null
  project_id: string | null
  read_at: number | null
  created_at: number | null
}

export interface NotificationList {
  unread_count: number
  items: NotificationView[]
}

export function getNotifications(limit?: number) {
  const qs = limit ? `?limit=${limit}` : ""
  return authedJson<NotificationList>(`/api/notifications${qs}`)
}

// task 7.4 — mark read
export function markNotificationRead(id: string) {
  return authedJson<{ id: string; read_at: number }>(
    `/api/notifications/${id}`,
    { method: "PATCH" }
  )
}

export function markAllNotificationsRead() {
  return authedJson<{ marked: number }>("/api/notifications/read-all", {
    method: "POST",
  })
}

// SPEC §5.7 R2: where opening a notification navigates. The content item lives
// on its project page (no standalone detail route), anchored by row id.
export function notificationHref(n: NotificationView): string {
  if (n.project_id && n.content_item_id) {
    return `/campaigns/${n.project_id}#item-${n.content_item_id}`
  }
  if (n.project_id) return `/campaigns/${n.project_id}`
  return "/campaigns"
}
