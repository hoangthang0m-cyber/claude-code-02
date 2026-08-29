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
