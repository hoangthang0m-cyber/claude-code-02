import { z } from "zod"

import {
  MAX_REMINDERS_PER_ITEM,
  REMINDER_CHANNELS,
  type ReminderChannel,
} from "@/lib/domain/calendar/enums"

// A reminder offset on a calendar (`defaultReminders`) or an item (`reminders`)
// — Mục C §1:
//   Reminder = { offsetMinutes: number, channel: "inapp" | "push" }
//
// `offsetMinutes` = minutes BEFORE `startAt`. For an all-day item, `startAt` is
// 00:00 giờ VN, so "09:00 ngày hôm trước" = offsetMinutes 900 (Mục C §1).
export interface Reminder {
  offsetMinutes: number
  channel: ReminderChannel
}

// Max lookahead: 4 weeks before start (Mục B `calendar-reminders` —
// "phút/giờ/ngày/tuần").
const MAX_OFFSET_MINUTES = 4 * 7 * 24 * 60

export const reminderSchema = z.object({
  offsetMinutes: z.number().int().min(0).max(MAX_OFFSET_MINUTES),
  channel: z.enum(REMINDER_CHANNELS),
})

// Ghi đè mốc nhắc theo mục — tối đa MAX_REMINDERS_PER_ITEM (Mục B
// `calendar-reminders` — "Vượt số mốc tối đa" → từ chối).
export const remindersSchema = z.array(reminderSchema).max(MAX_REMINDERS_PER_ITEM)

// Common presets surfaced in the reminder editor (task 10.2). Not exhaustive —
// the editor also allows a custom offset.
export const REMINDER_PRESETS: ReadonlyArray<{ label: string; offsetMinutes: number }> =
  [
    { label: "Lúc bắt đầu", offsetMinutes: 0 },
    { label: "5 phút trước", offsetMinutes: 5 },
    { label: "10 phút trước", offsetMinutes: 10 },
    { label: "30 phút trước", offsetMinutes: 30 },
    { label: "1 giờ trước", offsetMinutes: 60 },
    { label: "1 ngày trước", offsetMinutes: 24 * 60 },
    { label: "1 tuần trước", offsetMinutes: 7 * 24 * 60 },
  ]

// A reminder offset as a {value, unit} pair for the editor UI (Mục B
// `calendar-reminders` — "phút/giờ/ngày/tuần").
export const REMINDER_UNITS = ["minute", "hour", "day", "week"] as const
export type ReminderUnit = (typeof REMINDER_UNITS)[number]

export const REMINDER_UNIT_MINUTES: Record<ReminderUnit, number> = {
  minute: 1,
  hour: 60,
  day: 24 * 60,
  week: 7 * 24 * 60,
}

export const REMINDER_UNIT_LABELS: Record<ReminderUnit, string> = {
  minute: "phút",
  hour: "giờ",
  day: "ngày",
  week: "tuần",
}

export function offsetToParts(offsetMinutes: number): {
  value: number
  unit: ReminderUnit
} {
  for (const unit of ["week", "day", "hour"] as const) {
    const m = REMINDER_UNIT_MINUTES[unit]
    if (offsetMinutes > 0 && offsetMinutes % m === 0) {
      return { value: offsetMinutes / m, unit }
    }
  }
  return { value: offsetMinutes, unit: "minute" }
}

export function partsToOffset(value: number, unit: ReminderUnit): number {
  return Math.max(0, Math.round(value)) * REMINDER_UNIT_MINUTES[unit]
}

// Human label for one reminder, e.g. "10 phút trước".
export function reminderLabel(r: Reminder): string {
  if (r.offsetMinutes === 0) return "lúc bắt đầu"
  const { value, unit } = offsetToParts(r.offsetMinutes)
  return `${value} ${REMINDER_UNIT_LABELS[unit]} trước`
}
