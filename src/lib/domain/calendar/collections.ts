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

// In-app reminder + assignment notifications reuse the existing flat
// `notifications` collection (src/lib/domain/notification.ts) rather than the
// `notifications/{uid}/items` shape sketched in Mục C §1 — decision recorded in
// the spec doc's answers section. No new collection id here.
