import { authedJson } from "@/lib/api/authedFetch"
import type {
  CalendarItemType,
  CalendarColorKey,
  Reminder,
} from "@/lib/domain/calendar"

// Client wrappers for the calendarItems route handlers (Mục D group 5 / 7).
// Reads stay on onSnapshot (useCalendarItems); mutations go through /api so the
// server runs validation, the permission matrix and the day-field recompute.

export interface CalendarItemInput {
  calendarId: string
  type: CalendarItemType
  title?: string
  description?: string | null
  location?: string | null
  allDay?: boolean
  startAt: string // ISO
  endAt: string // ISO
  colorOverride?: CalendarColorKey | null
  assigneeIds?: string[]
  primaryAssigneeId?: string | null
  linkedProjectId?: string | null
  linkedContentItemId?: string | null
  reminders?: Reminder[]
  recurrence?: string | null
}

export function createCalendarItem(
  input: CalendarItemInput
): Promise<{ id: string }> {
  return authedJson("/api/calendar-items", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export interface RecurrenceScope {
  scope: "this" | "thisAndFollowing" | "all"
  occurrenceKey: string
  overwriteExceptions?: boolean
}

export function updateCalendarItem(
  itemId: string,
  patch: Partial<CalendarItemInput> & Partial<RecurrenceScope>
): Promise<{ id: string }> {
  return authedJson(`/api/calendar-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

export function deleteCalendarItem(
  itemId: string,
  scope?: RecurrenceScope
): Promise<{ id: string }> {
  return authedJson(`/api/calendar-items/${itemId}`, {
    method: "DELETE",
    ...(scope ? { body: JSON.stringify(scope) } : {}),
  })
}

export function restoreCalendarItem(itemId: string): Promise<{ id: string }> {
  return authedJson(`/api/calendar-items/${itemId}/restore`, { method: "POST" })
}

export function duplicateCalendarItem(
  itemId: string
): Promise<{ id: string }> {
  return authedJson(`/api/calendar-items/${itemId}/duplicate`, {
    method: "POST",
  })
}
