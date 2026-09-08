import {
  DAY_MS,
  daysBetweenKeys,
  enumerateDayKeys,
  vnDateKey,
  vnDayStartMs,
} from "@/lib/domain/calendar/dayFields"
import type { ViewWindow } from "@/lib/domain/calendar/viewQuery"
import type { CalendarView } from "@/lib/domain/calendar/enums"

// Pure date math for the five views (Mục B `calendar-views`; Mục D group 6).
// Everything is keyed on "YYYY-MM-DD" in giờ VN; the team uses one timezone with
// a Monday week start (weekStartsOn = 1).

export const AGENDA_PAGE_DAYS = 30

// The weekday of a day key, 0 = Sunday … 6 = Saturday (giờ VN).
export function vnWeekday(dayKey: string): number {
  return new Date(vnDayStartMs(dayKey) + 12 * 3600_000).getUTCDay()
}

function addDays(dayKey: string, days: number): string {
  return vnDateKey(vnDayStartMs(dayKey) + days * DAY_MS)
}

function addMonths(dayKey: string, months: number): string {
  const [y, m, d] = dayKey.split("-").map(Number)
  const base = new Date(Date.UTC(y, m - 1 + months, 1))
  const daysInTarget = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const day = Math.min(d, daysInTarget)
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// Monday (weekStartsOn=1) on or before `dayKey`.
export function startOfWeek(dayKey: string, weekStartsOn = 1): string {
  const wd = vnWeekday(dayKey)
  const diff = (wd - weekStartsOn + 7) % 7
  return addDays(dayKey, -diff)
}

export function weekDays(dayKey: string, weekStartsOn = 1): string[] {
  return enumerateDayKeys(startOfWeek(dayKey, weekStartsOn), 7)
}

// The 6×7 grid the month view shows (Mục B `calendar-views` — "lưới 6 hàng tuần").
export function monthGridDays(dayKey: string, weekStartsOn = 1): string[] {
  const [y, m] = dayKey.split("-").map(Number)
  const firstOfMonth = `${y}-${String(m).padStart(2, "0")}-01`
  return enumerateDayKeys(startOfWeek(firstOfMonth, weekStartsOn), 42)
}

export function isInMonth(dayKey: string, anchorDayKey: string): boolean {
  return dayKey.slice(0, 7) === anchorDayKey.slice(0, 7)
}

export function monthKey(dayKey: string): string {
  return dayKey.slice(0, 7)
}

// The window `useCalendarItems` should query for a view anchored at `anchorDay`.
export function viewWindow(
  view: CalendarView,
  anchorDay: string,
  weekStartsOn = 1
): ViewWindow {
  switch (view) {
    case "day":
      return { startDay: anchorDay, endDay: anchorDay }
    case "week": {
      const days = weekDays(anchorDay, weekStartsOn)
      return { startDay: days[0], endDay: days[6] }
    }
    case "month": {
      const grid = monthGridDays(anchorDay, weekStartsOn)
      return { startDay: grid[0], endDay: grid[41] }
    }
    case "agenda":
      return { startDay: anchorDay, endDay: addDays(anchorDay, AGENDA_PAGE_DAYS - 1) }
    case "year": {
      const y = anchorDay.slice(0, 4)
      return { startDay: `${y}-01-01`, endDay: `${y}-12-31` }
    }
  }
}

// ‹ / › — step the anchor by the view's unit (Mục B `calendar-views`).
export function stepAnchor(
  view: CalendarView,
  anchorDay: string,
  direction: 1 | -1
): string {
  switch (view) {
    case "day":
      return addDays(anchorDay, direction)
    case "week":
      return addDays(anchorDay, direction * 7)
    case "agenda":
      return addDays(anchorDay, direction * AGENDA_PAGE_DAYS)
    case "month":
      return addMonths(anchorDay, direction)
    case "year":
      return addMonths(anchorDay, direction * 12)
  }
}

export function todayKey(now: number = Date.now()): string {
  return vnDateKey(now)
}

// ── Labels ──────────────────────────────────────────────────────────────────

const MONTHS_VI = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
]

function d(dayKey: string): { y: number; m: number; day: number } {
  const [y, m, day] = dayKey.split("-").map(Number)
  return { y, m, day }
}

export function rangeLabel(view: CalendarView, anchorDay: string, weekStartsOn = 1): string {
  const a = d(anchorDay)
  switch (view) {
    case "day":
      return `${a.day} ${MONTHS_VI[a.m - 1]}, ${a.y}`
    case "week": {
      const days = weekDays(anchorDay, weekStartsOn)
      const s = d(days[0])
      const e = d(days[6])
      if (s.m === e.m) return `${s.day}–${e.day} ${MONTHS_VI[s.m - 1]} ${s.y}`
      if (s.y === e.y)
        return `${s.day} ${MONTHS_VI[s.m - 1]} – ${e.day} ${MONTHS_VI[e.m - 1]} ${e.y}`
      return `${s.day} ${MONTHS_VI[s.m - 1]} ${s.y} – ${e.day} ${MONTHS_VI[e.m - 1]} ${e.y}`
    }
    case "month":
      return `${MONTHS_VI[a.m - 1]} ${a.y}`
    case "year":
      return `${a.y}`
    case "agenda": {
      const w = viewWindow("agenda", anchorDay)
      const e = d(w.endDay)
      return `${a.day} ${MONTHS_VI[a.m - 1]} – ${e.day} ${MONTHS_VI[e.m - 1]} ${e.y}`
    }
  }
}

// ── ISO-8601 week number (Mục D task 6.9) ────────────────────────────────────

export function isoWeekNumber(dayKey: string): number {
  const ms = vnDayStartMs(dayKey)
  // shift to the Thursday of this ISO week
  const date = new Date(ms + 12 * 3600_000)
  const dayNr = (date.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3)
  return (
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / (7 * DAY_MS)
    )
  )
}

// Whole months of a year, each with its own 6×7 grid (year view — task 6.6).
export function yearMonths(year: number, weekStartsOn = 1): {
  monthKey: string
  label: string
  grid: string[]
}[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mk = `${year}-${String(i + 1).padStart(2, "0")}`
    return {
      monthKey: mk,
      label: MONTHS_VI[i],
      grid: monthGridDays(`${mk}-01`, weekStartsOn),
    }
  })
}

export { daysBetweenKeys }
