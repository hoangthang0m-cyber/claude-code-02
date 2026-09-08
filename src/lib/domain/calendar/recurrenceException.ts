import type { Timestamp } from "firebase/firestore"

import type { CalendarItem } from "@/lib/domain/calendar/calendarItem"
import type { RecurrenceExceptionAction } from "@/lib/domain/calendar/enums"

// calendarItems/{masterItemId}/exceptions/{originalDateKey} (Mục C §1 / §4).
//
// One override for ONE occurrence of a recurring series. Doc id =
// `originalDateKey` ("YYYY-MM-DD" giờ VN of the occurrence's original start),
// so editing/deleting a single occurrence is an idempotent write. Expanding the
// series on the client only needs to read this subcollection alongside the
// master (Mục C §2 / §4).
export interface RecurrenceException {
  originalDateKey: string
  action: RecurrenceExceptionAction // "modified" | "cancelled"
  // Fields overridden for this occurrence (empty for "cancelled"). Narrowed from
  // the Mục C §1 `Partial<CalendarItem>` to the fields an occurrence may
  // legitimately diverge on — id / calendarId / recurrence / day fields are not
  // overridable per-occurrence.
  overrides: Partial<
    Pick<
      CalendarItem,
      | "title"
      | "description"
      | "location"
      | "type"
      | "allDay"
      | "startAt"
      | "endAt"
      | "colorOverride"
      | "assigneeIds"
      | "primaryAssigneeId"
      | "reminders"
    >
  >
  originalStartAt: Timestamp
}

// "YYYY-MM-DD" giờ VN — the key format shared by exceptions, dayKeys and the
// day-range queries (Mục C §1 / §2).
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDateKey(value: string): boolean {
  return DATE_KEY_RE.test(value)
}
