// Firestore collection / document ids for the Team Activity Calendar
// (docs/team-activity-calendar-spec.md — Mục C §1). Separate from the CPT
// COLLECTIONS map. Mục D group 1, task 1.1.

export const CALENDAR_COLLECTIONS = {
  // config/calendarSettings — single settings document (task 1.4).
  config: "config",
  calendars: "calendars",
  calendarItems: "calendarItems",
  // subcollection: calendarItems/{masterItemId}/exceptions/{originalDateKey}
  exceptions: "exceptions",
  // userCalendarPrefs/{uid}
  userCalendarPrefs: "userCalendarPrefs",
  // members/{uid} — read-fast copy of `users` for the calendar (Mục C §7)
  members: "members",
  // dueReminders/{reminderId} — server-only queue (Mục C §5 / §6)
  dueReminders: "dueReminders",
  // calendarNotifications/{uid}/items/{notifId} — in-app bell feed. Named apart
  // from the CPT `notifications` collection so the two never collide and the
  // calendar keeps its own rules / shape (Mục C §1 `notifications/{uid}/items`).
  calendarNotifications: "calendarNotifications",
  calendarNotificationItems: "items",
  // fcmTokens/{uid}/tokens/{tokenId} — model only; push deferred past v1
  fcmTokens: "fcmTokens",
} as const

export type CalendarCollectionId =
  (typeof CALENDAR_COLLECTIONS)[keyof typeof CALENDAR_COLLECTIONS]

export const CALENDAR_SETTINGS_DOC_ID = "calendarSettings"

// In-app reminder + assignment notifications land in `calendarNotifications/
// {uid}/items` (above), NOT the CPT `notifications` collection. The CPT store is
// project/content-scoped and its type enum lives in the CPT domain, which this
// feature must not modify; the spec's own §1 sketch is a per-uid subcollection
// anyway. Reuse of `src/modules/notifications` is limited to mirroring its bell
// UI patterns. Decision locked in group 9–10 (spec doc infra note).
