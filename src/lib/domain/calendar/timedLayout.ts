import {
  toMillis,
  vnDateKey,
  vnDayStartMs,
  type TimeValue,
} from "@/lib/domain/calendar/dayFields"

// Positioning maths for the Day / Week hour grid (Mục D tasks 6.2 / 6.4). Pure.

export const DAY_MINUTES = 24 * 60
export const WORKDAY_SCROLL_MINUTE = 7 * 60 // grid opens scrolled to ~07:00
export const GRID_HOUR_PX = 48 // pixel height of one hour row in the Day/Week grid

// Minutes from VN-midnight of `dayKey` to `instant`, clamped to [0, 1440].
export function minutesIntoDay(instant: TimeValue, dayKey: string): number {
  const ms = toMillis(instant) - vnDayStartMs(dayKey)
  return Math.max(0, Math.min(DAY_MINUTES, Math.round(ms / 60_000)))
}

// A timed item's top/bottom (in minutes) within one day column. For a
// multi-day item this clips to the column's day.
export function itemDayBounds(
  item: { startAt: TimeValue; endAt: TimeValue },
  dayKey: string
): { topMin: number; bottomMin: number } {
  const topMin = minutesIntoDay(item.startAt, dayKey)
  const bottomMin = minutesIntoDay(item.endAt, dayKey)
  return { topMin, bottomMin: Math.max(bottomMin, topMin + 1) }
}

// The now-line as a percentage down the day, or null when `dayKey` is not today
// (giờ VN). Recompute on a minute tick (task 6.4).
export function nowLinePercent(now: number, dayKey: string): number | null {
  if (vnDateKey(now) !== dayKey) return null
  return (minutesIntoDay(now, dayKey) / DAY_MINUTES) * 100
}

// "HH:mm" label for an hour row.
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}
