import { DAY_MS, toMillis, type TimeValue } from "@/lib/domain/calendar/dayFields"

// Snap / drag maths for direct manipulation on the grid (Mục B
// `calendar-item-editing`; Mục D group 7). Pure.

export const SNAP_MINUTES = 15
export const MIN_DURATION_MINUTES = 15
export const QUICK_CREATE_DURATION_MINUTES = 60

// Round a minute value to the nearest 15-minute mark (task 7.2 — "thả ở 10:07 →
// 10:00 hoặc 10:15").
export function snapMinutes(minute: number, step = SNAP_MINUTES): number {
  return Math.round(minute / step) * step + 0 // `+ 0` normalises -0 → 0
}

// A vertical pixel offset within a day column → a snapped minute-of-day.
export function pxToSnappedMinute(
  offsetPx: number,
  hourPx: number,
  step = SNAP_MINUTES
): number {
  const minute = (offsetPx / hourPx) * 60
  return Math.max(0, Math.min(24 * 60, snapMinutes(minute, step)))
}

export interface TimeRangeMs {
  startMs: number
  endMs: number
}

function ms(v: TimeValue): number {
  return toMillis(v)
}

// Move: shift by whole days and by snapped minutes, keeping the duration
// (task 7.3). `deltaMinutes` is applied only for the Day/Week grid.
export function applyDragMove(
  item: { startAt: TimeValue; endAt: TimeValue },
  opts: { deltaDays?: number; deltaMinutes?: number }
): TimeRangeMs {
  const startMs = ms(item.startAt)
  const duration = ms(item.endAt) - startMs
  const dayShift = (opts.deltaDays ?? 0) * DAY_MS
  const minuteShift = snapMinutes(opts.deltaMinutes ?? 0) * 60_000
  const nextStart = startMs + dayShift + minuteShift
  return { startMs: nextStart, endMs: nextStart + duration }
}

// Resize one edge, snapped, never shorter than MIN_DURATION_MINUTES and never
// inverted (task 7.5).
export function applyResize(
  item: { startAt: TimeValue; endAt: TimeValue },
  edge: "start" | "end",
  deltaMinutes: number
): TimeRangeMs {
  const startMs = ms(item.startAt)
  const endMs = ms(item.endAt)
  const shift = snapMinutes(deltaMinutes) * 60_000
  const minDuration = MIN_DURATION_MINUTES * 60_000

  if (edge === "end") {
    return { startMs, endMs: Math.max(endMs + shift, startMs + minDuration) }
  }
  return { startMs: Math.min(startMs + shift, endMs - minDuration), endMs }
}

// Bounds for a click-to-create (task 7.1): Day/Week → a timed 60' block at the
// slot; Month → an all-day block for the day.
export function quickCreateBounds(
  view: "day" | "week" | "month" | "year" | "agenda",
  slotMs: number
): TimeRangeMs & { allDay: boolean } {
  if (view === "month" || view === "year" || view === "agenda") {
    // caller passes VN-midnight of the day for these
    return { startMs: slotMs, endMs: slotMs + DAY_MS, allDay: true }
  }
  // slotMs is already snapped to the clicked 15-minute slot by the grid
  return {
    startMs: slotMs,
    endMs: slotMs + QUICK_CREATE_DURATION_MINUTES * 60_000,
    allDay: false,
  }
}
