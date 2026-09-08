import type {
  CalendarColorKey,
  CalendarView,
} from "@/lib/domain/calendar/enums"

export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6

// config/calendarSettings — one document (Mục C §1). Seeded by task 1.4.
export interface CalendarSettings {
  timezone: string // "Asia/Ho_Chi_Minh" (đội dùng một múi giờ, không DST)
  weekStartsOn: WeekStart // 1 = thứ Hai (Mục C §1)
  defaultView: CalendarView
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  timezone: "Asia/Ho_Chi_Minh",
  weekStartsOn: 1,
  defaultView: "week",
}

// userCalendarPrefs/{uid} — per-person hide/show + colour override
// (Mục B `team-calendar` — "Ẩn/hiện và màu ghi đè theo từng người"). Doc id = uid.
export interface UserCalendarPrefs {
  uid: string
  hidden: string[] // calendarIds hidden on this person's side
  colorOverrides: Record<string, CalendarColorKey> // calendarId -> colour key
  // Nhớ khung nhìn gần nhất (task 6.11 — localStorage HOẶC đây).
  lastView?: CalendarView
  // Hiển thị số tuần (task 6.9).
  showWeekNumbers?: boolean
}

export const EMPTY_USER_CALENDAR_PREFS: Omit<UserCalendarPrefs, "uid"> = {
  hidden: [],
  colorOverrides: {},
}
