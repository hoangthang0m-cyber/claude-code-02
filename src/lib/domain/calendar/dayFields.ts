import { ICT_OFFSET_MS } from "@/lib/domain/reportPeriod"
import { LONG_SPAN_THRESHOLD_DAYS } from "@/lib/domain/calendar/enums"

// Derives a CalendarItem's "day" fields (startDay / endDay / spanDays / dayKeys /
// isLongSpan) from its start/end instants, in giờ VN (Mục C §1; Mục D task 3.4).
//
// Asia/Ho_Chi_Minh is UTC+7 with no DST, so a VN wall-clock instant is exactly
// `UTC + 7h` — the same fixed-offset trick src/lib/domain/reportPeriod.ts uses.
// `endAt` is EXCLUSIVE (Mục C §1): an item ending at 00:00 of day D+1 touches
// only up to day D.

export { ICT_OFFSET_MS }

export const DAY_MS = 24 * 60 * 60 * 1000

// Accepts an epoch-ms number, a Date, a Firestore Timestamp (client or admin),
// or a plain `{ seconds, nanoseconds }` from a serialised doc.
export type TimeValue =
  | number
  | Date
  | { toMillis: () => number }
  | { seconds: number; nanoseconds?: number }

export function toMillis(value: TimeValue): number {
  if (typeof value === "number") return value
  if (value instanceof Date) return value.getTime()
  if ("toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis()
  }
  if ("seconds" in value) {
    return value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6)
  }
  throw new TypeError("computeDayFields: unrecognised time value")
}

// "YYYY-MM-DD" of an instant, in giờ VN.
export function vnDateKey(ms: number): string {
  return new Date(ms + ICT_OFFSET_MS).toISOString().slice(0, 10)
}

// The instant of VN-midnight starting a "YYYY-MM-DD" (as a UTC epoch ms).
export function vnDayStartMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`) - ICT_OFFSET_MS
}

// Whole VN days from `fromKey` to `toKey` inclusive (>= 1 when to >= from).
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((vnDayStartMs(toKey) - vnDayStartMs(fromKey)) / DAY_MS) + 1
}

// Every "YYYY-MM-DD" from `startDay`, `count` days long.
export function enumerateDayKeys(startDay: string, count: number): string[] {
  const out: string[] = []
  let ms = vnDayStartMs(startDay)
  for (let i = 0; i < count; i++) {
    out.push(vnDateKey(ms))
    ms += DAY_MS
  }
  return out
}

export interface DayFields {
  startDay: string
  endDay: string
  spanDays: number
  dayKeys: string[] | null
  isLongSpan: boolean
}

export function computeDayFields(input: {
  startAt: TimeValue
  endAt: TimeValue
  // Accepted for call-site convenience; the day math is identical either way
  // (all-day items are stored with midnight-aligned instants by the repo).
  allDay?: boolean
}): DayFields {
  const startMs = toMillis(input.startAt)
  const endMsExclusive = toMillis(input.endAt)

  const startDay = vnDateKey(startMs)
  // endAt is exclusive → the last day touched is the VN date of the instant
  // just before it. `max` guards degenerate (endAt <= startAt) inputs.
  const endDay = vnDateKey(Math.max(startMs, endMsExclusive - 1))

  const spanDays = daysBetweenKeys(startDay, endDay)
  const isLongSpan = spanDays > LONG_SPAN_THRESHOLD_DAYS

  return {
    startDay,
    endDay,
    spanDays,
    dayKeys: isLongSpan ? null : enumerateDayKeys(startDay, spanDays),
    isLongSpan,
  }
}
