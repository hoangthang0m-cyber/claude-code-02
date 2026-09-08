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
  // fcmTokens/{uid}/tokens/{tokenId} — model only; push deferred past v1
  fcmTokens: "fcmTokens",
} as const

export type CalendarCollectionId =
  (typeof CALENDAR_COLLECTIONS)[keyof typeof CALENDAR_COLLECTIONS]

export const CALENDAR_SETTINGS_DOC_ID = "calendarSettings"

// In-app reminder + assignment notifications: the store is still to be locked
// with the manager in groups 9–10 (spec doc infra note — "`notifications`: chi
// tiết chốt ở nhóm 9–10"). Candidates: reuse the flat CPT `notifications`
// collection (src/lib/domain/notification.ts), a calendar-owned collection, or
// the `notifications/{uid}/items` shape from Mục C §1. No new collection id here
// until that decision is made.
