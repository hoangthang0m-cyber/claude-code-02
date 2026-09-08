import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import {
  CALENDAR_COLOR_KEYS,
  CALENDAR_WRITE_SCOPES,
  type CalendarColorKey,
  type CalendarKind,
  type CalendarWriteScope,
} from "@/lib/domain/calendar/enums"
import { remindersSchema, type Reminder } from "@/lib/domain/calendar/reminder"

// calendars/{calendarId} — a sub-calendar: personal or shared (Mục C §1).
export interface Calendar {
  id: string
  name: string
  color: CalendarColorKey
  description: string | null
  kind: CalendarKind
  ownerUid: string | null // set only when kind === "personal"
  writeScope: CalendarWriteScope
  defaultReminders: Reminder[]
  archived: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Create a sub-calendar: name + colour required (Mục B `team-calendar` —
// "Tạo lịch con thiếu tên hoặc màu" → từ chối). Manager-only, enforced in the
// route handler and firestore.rules (groups 4 / 11). `kind` is always "shared"
// here — personal calendars are created by the members sync (task 2.4).
export const calendarCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.enum(CALENDAR_COLOR_KEYS),
  description: z.string().trim().max(2000).nullable().optional(),
  writeScope: z.enum(CALENDAR_WRITE_SCOPES).default("everyone"),
  defaultReminders: remindersSchema.default([]),
})

export type CalendarCreate = z.infer<typeof calendarCreateSchema>

// Edit (task 4.3) + archive toggle (task 4.5): every field optional. `kind` /
// `ownerUid` never change.
export const calendarUpdateSchema = calendarCreateSchema.partial().extend({
  archived: z.boolean().optional(),
})

export type CalendarUpdate = z.infer<typeof calendarUpdateSchema>

// Delete a sub-calendar that still holds items (task 4.4): either move the items
// to another calendar, or delete them too.
export const CALENDAR_DELETE_MODES = ["reassign", "deleteItems"] as const
export type CalendarDeleteMode = (typeof CALENDAR_DELETE_MODES)[number]

export const calendarDeleteSchema = z.object({
  mode: z.enum(CALENDAR_DELETE_MODES),
  targetCalendarId: z.string().trim().min(1).nullable().default(null),
})

export type CalendarDeleteRequest = z.infer<typeof calendarDeleteSchema>

// The four default shared calendars seeded at first run (Mục B `team-calendar` /
// task 2.3). "Mục tiêu phòng" is managerOnly (Mục B `calendar-access-control` —
// 'Lịch con "chỉ Trưởng phòng ghi"'). Fixed doc ids so the seed
// (`scripts/seed-calendars.mjs`) is idempotent and non-destructive — kept in
// sync with that script.
export interface DefaultSharedCalendar {
  id: string
  name: string
  color: CalendarColorKey
  writeScope: CalendarWriteScope
  defaultReminders: Reminder[]
}

export const DEFAULT_SHARED_CALENDARS: readonly DefaultSharedCalendar[] = [
  {
    id: "default_goals",
    name: "Mục tiêu phòng",
    color: "grape",
    writeScope: "managerOnly",
    defaultReminders: [{ offsetMinutes: 24 * 60, channel: "inapp" }],
  },
  {
    id: "default_campaigns",
    name: "Chiến dịch",
    color: "tangerine",
    writeScope: "everyone",
    defaultReminders: [{ offsetMinutes: 30, channel: "inapp" }],
  },
  {
    id: "default_content",
    name: "Nội dung",
    color: "peacock",
    writeScope: "everyone",
    defaultReminders: [{ offsetMinutes: 10, channel: "inapp" }],
  },
  {
    id: "default_ads",
    name: "Ads",
    color: "basil",
    writeScope: "everyone",
    defaultReminders: [{ offsetMinutes: 10, channel: "inapp" }],
  },
]
