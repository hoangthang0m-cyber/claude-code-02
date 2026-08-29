import { authedJson } from "@/lib/api/authedFetch"
import type { NotificationGroup } from "@/lib/domain"

// Client wrapper for the notification-preference toggles (SPEC §5.7 R4, task 7.5).

export interface NotificationPreferenceView {
  group: NotificationGroup
  label: string
  enabled: boolean
}

export function getNotificationPreferences() {
  return authedJson<{ preferences: NotificationPreferenceView[] }>(
    "/api/notification-preferences"
  )
}

export function setNotificationPreference(
  group: NotificationGroup,
  enabled: boolean
) {
  return authedJson<{ group: NotificationGroup; enabled: boolean }>(
    "/api/notification-preferences",
    { method: "PUT", body: JSON.stringify({ group, enabled }) }
  )
}
