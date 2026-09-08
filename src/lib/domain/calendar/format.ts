import { toMillis, type TimeValue } from "@/lib/domain/calendar/dayFields"

// Display formatting for calendar items, always in giờ VN (the team's single
// timezone). Uses Intl with an explicit timeZone rather than the fixed-offset
// trick so the strings are locale-correct.

const TZ = "Asia/Ho_Chi_Minh"

const fmtDate = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  day: "numeric",
  month: "numeric",
  year: "numeric",
})
const fmtTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export function formatVnDate(value: TimeValue): string {
  return fmtDate.format(new Date(toMillis(value)))
}

export function formatVnTime(value: TimeValue): string {
  return fmtTime.format(new Date(toMillis(value)))
}

// A human range for an item's detail popover / list rows (task 5.1 / 12.1).
// `endAt` is exclusive, so an all-day item shows its inclusive last day.
export function formatItemTimeRange(item: {
  startAt: TimeValue
  endAt: TimeValue
  allDay: boolean
}): string {
  const startMs = toMillis(item.startAt)
  const endMs = toMillis(item.endAt)

  if (item.allDay) {
    const lastDay = formatVnDate(endMs - 1)
    const first = formatVnDate(startMs)
    return first === lastDay
      ? `Cả ngày · ${first}`
      : `Cả ngày · ${first} – ${lastDay}`
  }

  const startDate = formatVnDate(startMs)
  const endDate = formatVnDate(endMs)
  if (startDate === endDate) {
    return `${startDate} · ${formatVnTime(startMs)}–${formatVnTime(endMs)}`
  }
  return `${startDate} ${formatVnTime(startMs)} – ${endDate} ${formatVnTime(endMs)}`
}

// The value the datetime-local / date inputs need, in giờ VN.
export function toVnInputDate(value: TimeValue): string {
  // "YYYY-MM-DD"
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(toMillis(value))
  )
}

export function toVnInputDateTime(value: TimeValue): string {
  // "YYYY-MM-DDTHH:mm"
  const d = new Date(toMillis(value))
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d)
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d)
  return `${date}T${time}`
}

// Inverse — a VN `<input type="date">` / `type="datetime-local">` value back to
// an epoch ms (Asia/Ho_Chi_Minh is UTC+7, no DST).
export function vnDateInputToMs(dateValue: string): number {
  return Date.parse(`${dateValue}T00:00:00.000+07:00`)
}

export function vnDateTimeInputToMs(dateTimeValue: string): number {
  return Date.parse(`${dateTimeValue}:00.000+07:00`)
}
