import { authedJson } from "@/lib/api/authedFetch"
import type {
  CalendarCreate,
  CalendarDeleteMode,
  CalendarUpdate,
} from "@/lib/domain/calendar"

// Client wrappers for the sub-calendar route handlers (Mục D group 4).
// Trưởng phòng only — the server re-checks; the UI hides the controls.

export function createCalendar(input: CalendarCreate): Promise<{ id: string }> {
  return authedJson("/api/calendars", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateCalendar(
  calendarId: string,
  patch: CalendarUpdate
): Promise<{ id: string }> {
  return authedJson(`/api/calendars/${calendarId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

export function setCalendarArchived(
  calendarId: string,
  archived: boolean
): Promise<{ id: string }> {
  return updateCalendar(calendarId, { archived })
}

export function deleteCalendar(
  calendarId: string,
  mode: CalendarDeleteMode,
  targetCalendarId: string | null
): Promise<{ mode: CalendarDeleteMode; affectedItems: number }> {
  return authedJson(`/api/calendars/${calendarId}`, {
    method: "DELETE",
    body: JSON.stringify({ mode, targetCalendarId }),
  })
}
