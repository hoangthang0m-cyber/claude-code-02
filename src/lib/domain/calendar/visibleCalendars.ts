import type { Calendar } from "@/lib/domain/calendar/calendar"
import {
  CALENDAR_COLORS,
  type CalendarColorKey,
} from "@/lib/domain/calendar/enums"
import type { UserCalendarPrefs } from "@/lib/domain/calendar/settings"

// Merges the shared `calendars` list with one viewer's `userCalendarPrefs`
// (hide/show + colour override) into the list the sidebar and grid use
// (Mục B `team-calendar` — "Ẩn/hiện và màu ghi đè theo từng người"; Mục D
// task 3.2). Pure — the hook just feeds it two realtime reads.

export interface VisibleCalendar {
  calendar: Calendar
  hidden: boolean // hidden on this viewer's side
  effectiveColor: CalendarColorKey // the viewer's override, else the calendar's
  effectiveHex: string
}

export function resolveVisibleCalendars(
  calendars: readonly Calendar[],
  prefs: Pick<UserCalendarPrefs, "hidden" | "colorOverrides"> | null | undefined,
  opts: { includeArchived?: boolean } = {}
): VisibleCalendar[] {
  const hiddenSet = new Set(prefs?.hidden ?? [])
  const overrides = prefs?.colorOverrides ?? {}

  return calendars
    .filter((c) => opts.includeArchived || !c.archived)
    .map((calendar) => {
      const override = overrides[calendar.id]
      const effectiveColor: CalendarColorKey =
        override && override in CALENDAR_COLORS ? override : calendar.color
      return {
        calendar,
        hidden: hiddenSet.has(calendar.id),
        effectiveColor,
        effectiveHex: CALENDAR_COLORS[effectiveColor].hex,
      }
    })
    .sort(byKindThenName)
}

// Personal calendars first ("Lịch của tôi"), then shared, each alphabetical.
function byKindThenName(a: VisibleCalendar, b: VisibleCalendar): number {
  if (a.calendar.kind !== b.calendar.kind) {
    return a.calendar.kind === "personal" ? -1 : 1
  }
  return a.calendar.name.localeCompare(b.calendar.name, "vi")
}

// calendarIds whose items should appear on the grid right now (shown + not
// archived).
export function visibleCalendarIdSet(
  resolved: readonly VisibleCalendar[]
): Set<string> {
  return new Set(
    resolved
      .filter((v) => !v.hidden && !v.calendar.archived)
      .map((v) => v.calendar.id)
  )
}
