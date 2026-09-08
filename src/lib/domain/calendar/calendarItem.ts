import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import {
  CALENDAR_COLOR_KEYS,
  CALENDAR_ITEM_TYPES,
  RECURRENCE_EDIT_SCOPES,
  type CalendarColorKey,
  type CalendarItemType,
} from "@/lib/domain/calendar/enums"
import { remindersSchema, type Reminder } from "@/lib/domain/calendar/reminder"
import { idString, isoDateString } from "@/lib/domain/shared"

// calendarItems/{itemId} — the unit shown on the calendar (Mục C §1).
//
// The "day" fields (startDay, endDay, spanDays, dayKeys, isLongSpan) are DERIVED
// from startAt/endAt/allDay in giờ VN and are always recomputed by the write
// layer (`computeDayFields`, tasks 3.4 / 3.5) — never taken from the client.
export interface CalendarItem {
  id: string
  calendarId: string
  type: CalendarItemType
  title: string // "" => hiển thị "(Không có tiêu đề)"
  description: string | null
  location: string | null
  allDay: boolean
  startAt: Timestamp
  endAt: Timestamp // EXCLUSIVE; for allDay: 00:00 of the day after endDay
  startDay: string // "YYYY-MM-DD", giờ VN
  endDay: string // "YYYY-MM-DD", giờ VN (inclusive last day the item touches)
  spanDays: number // number of calendar days the item touches (>= 1)
  dayKeys: string[] | null // every day touched — only when spanDays <= threshold
  isLongSpan: boolean // spanDays > LONG_SPAN_THRESHOLD_DAYS
  colorOverride: CalendarColorKey | null
  assigneeIds: string[]
  primaryAssigneeId: string | null
  linkedProjectId: string | null
  linkedContentItemId: string | null
  reminders: Reminder[]
  recurrence: string | null // RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"
  // Derived: `recurrence != null`. A boolean is needed because Firestore forbids
  // a `!=` filter combined with a range on another field, so the "load recurring
  // masters for a window" query (Mục C §2 step 3) filters `isRecurring == true`
  // (equality) + `startDay <= windowEnd` (range). Kept in sync by the write layer.
  isRecurring: boolean
  recurrenceId: string | null // itemId of the original if this is a split branch
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  updatedBy?: string // Mục B `team-calendar` "Sửa trường và lưu" — who last wrote
  deletedAt: Timestamp | null // soft delete for Undo; cleaned after 30 days
}

export const CALENDAR_ITEM_UNTITLED = "(Không có tiêu đề)"

// Mục B `team-calendar` — "Mục không tiêu đề" → hiển thị "(Không có tiêu đề)".
export function calendarItemDisplayTitle(title: string | null | undefined): string {
  return (title ?? "").trim() || CALENDAR_ITEM_UNTITLED
}

// ── Write schemas ───────────────────────────────────────────────────────────
// The caller supplies times as ISO strings; the route handler converts them to
// Timestamps and computes the day fields before writing.

const itemWritableFields = {
  calendarId: idString,
  type: z.enum(CALENDAR_ITEM_TYPES),
  title: z.string().trim().max(500),
  description: z.string().trim().max(8000).nullable(),
  location: z.string().trim().max(500).nullable(),
  allDay: z.boolean(),
  startAt: isoDateString,
  endAt: isoDateString,
  colorOverride: z.enum(CALENDAR_COLOR_KEYS).nullable(),
  assigneeIds: z.array(idString).max(50),
  primaryAssigneeId: idString.nullable(),
  linkedProjectId: idString.nullable(),
  linkedContentItemId: idString.nullable(),
  reminders: remindersSchema,
  recurrence: z.string().trim().min(1).max(1000).nullable(),
}

// Full editor form (task 5.2). `title` defaults to "" (Mục B — tiêu đề tuỳ chọn).
// `reminders` stays optional (no default) so the service can tell "not sent"
// (→ inherit the calendar's `defaultReminders`, task 10.1) from an explicit `[]`.
export const calendarItemCreateSchema = z.object({
  ...itemWritableFields,
  title: itemWritableFields.title.default(""),
  description: itemWritableFields.description.default(null),
  location: itemWritableFields.location.default(null),
  allDay: itemWritableFields.allDay.default(false),
  colorOverride: itemWritableFields.colorOverride.default(null),
  assigneeIds: itemWritableFields.assigneeIds.default([]),
  primaryAssigneeId: itemWritableFields.primaryAssigneeId.default(null),
  linkedProjectId: itemWritableFields.linkedProjectId.default(null),
  linkedContentItemId: itemWritableFields.linkedContentItemId.default(null),
  reminders: itemWritableFields.reminders.optional(),
  recurrence: itemWritableFields.recurrence.default(null),
})

export type CalendarItemCreate = z.infer<typeof calendarItemCreateSchema>

// Field-by-field update (task 5.2 / direct edits): every field optional.
export const calendarItemUpdateSchema = z.object(itemWritableFields).partial()

export type CalendarItemUpdate = z.infer<typeof calendarItemUpdateSchema>

// Scope-aware edit / delete of one occurrence of a recurring series
// (Mục D tasks 8.4 / 8.5). Sent alongside the field patch (edit) or alone
// (delete); `itemId` in the URL is the master.
export const recurrenceScopeSchema = z.object({
  scope: z.enum(RECURRENCE_EDIT_SCOPES),
  occurrenceKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overwriteExceptions: z.boolean().optional(),
})

export type RecurrenceScopeRequest = z.infer<typeof recurrenceScopeSchema>

// Quick create by clicking an empty slot (task 7.1): title + calendar +
// assignees only; type is forced to the default; times come from the slot.
export const calendarItemQuickCreateSchema = z.object({
  calendarId: idString,
  title: z.string().trim().max(500).default(""),
  startAt: isoDateString,
  endAt: isoDateString,
  allDay: z.boolean().default(false),
  assigneeIds: z.array(idString).max(50).default([]),
})

export type CalendarItemQuickCreate = z.infer<
  typeof calendarItemQuickCreateSchema
>

// Move / resize via drag (tasks 7.3 / 7.5): only the times change.
export const calendarItemTimeUpdateSchema = z.object({
  startAt: isoDateString,
  endAt: isoDateString,
  allDay: z.boolean().optional(),
})

// endAt > startAt for timed items; endDay >= startDay for all-day items
// (Mục B `team-calendar` — "Kết thúc trước bắt đầu" → từ chối; task 5.3).
export function isValidItemRange(
  startMs: number,
  endMs: number,
  allDay: boolean
): boolean {
  return allDay ? endMs >= startMs : endMs > startMs
}

// Primary-assignee invariant (Mục B `item-assignees`): if there is at least one
// assignee, exactly one is primary and it must be in the list; the first added
// is primary by default. Returns the resolved primary (or null when empty).
export function resolvePrimaryAssignee(
  assigneeIds: string[],
  requestedPrimary: string | null
): string | null {
  if (assigneeIds.length === 0) return null
  if (requestedPrimary && assigneeIds.includes(requestedPrimary)) {
    return requestedPrimary
  }
  return assigneeIds[0]
}

// Display order for assignees (Mục B `item-assignees` — "người phụ trách chính
// đứng đầu"): the primary first, the rest keeping their original order. Pure so
// the chip row, the detail popover and the editor all order the same way.
export function orderAssigneesByPrimary(
  assigneeIds: readonly string[],
  primaryAssigneeId: string | null
): string[] {
  if (!primaryAssigneeId || !assigneeIds.includes(primaryAssigneeId)) {
    return [...assigneeIds]
  }
  return [
    primaryAssigneeId,
    ...assigneeIds.filter((id) => id !== primaryAssigneeId),
  ]
}
