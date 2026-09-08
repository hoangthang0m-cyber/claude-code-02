// Enums / fixed value sets for the Team Activity Calendar
// (docs/team-activity-calendar-spec.md — Mục C §1). Mục D group 1, task 1.1.
//
// Unlike the Content Performance Tracker model (snake_case, docs/SPEC.md §6.1),
// this feature's spec fixes field names as **camelCase** and its own Firestore
// collections. So its domain lives in this `calendar/` subfolder and is NOT
// re-exported from the CPT barrel (src/lib/domain/index.ts) — import from
// "@/lib/domain/calendar" instead. Some names (Reminder, Member) would collide.

// ── Calendar item type / nhãn loại (Mục B `team-calendar`) ───────────────────

export const CALENDAR_ITEM_TYPES = ["goal", "activity", "task"] as const
export type CalendarItemType = (typeof CALENDAR_ITEM_TYPES)[number]

export const CALENDAR_ITEM_TYPE_LABELS: Record<CalendarItemType, string> = {
  goal: "Mục tiêu",
  activity: "Hoạt động",
  task: "Nhiệm vụ",
}

// Loại mặc định khi tạo nhanh bằng cách bấm ô trống
// (Mục B `calendar-item-editing` — "Lưu nhanh chỉ với tiêu đề" → loại `Nhiệm vụ`).
export const DEFAULT_CALENDAR_ITEM_TYPE: CalendarItemType = "task"

// ── Calendar (lịch con) ─────────────────────────────────────────────────────

export const CALENDAR_KINDS = ["personal", "shared"] as const
export type CalendarKind = (typeof CALENDAR_KINDS)[number]

export const CALENDAR_WRITE_SCOPES = ["everyone", "managerOnly"] as const
export type CalendarWriteScope = (typeof CALENDAR_WRITE_SCOPES)[number]

// ── Reminders ───────────────────────────────────────────────────────────────

export const REMINDER_CHANNELS = ["inapp", "push"] as const
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number]

// Số mốc nhắc tối đa cho một mục (Mục B `calendar-reminders` — "VD 5 mốc").
export const MAX_REMINDERS_PER_ITEM = 5

// ── Due-reminder queue (Mục C §5) ───────────────────────────────────────────

export const DUE_REMINDER_STATUSES = ["pending", "sent", "cancelled"] as const
export type DueReminderStatus = (typeof DUE_REMINDER_STATUSES)[number]

// ── In-app notification (chuông) — Mục C §1 `notifications/{uid}/items` ──────
// A calendar-owned collection (`calendarNotifications/{uid}/items`) rather than
// the CPT `notifications` collection, whose shape is project/content-scoped and
// whose type enum lives in the CPT domain (which this feature must not touch).
// Server-only writes; the owner reads their own via onSnapshot (Mục C §6).
export const CALENDAR_NOTIFICATION_KINDS = [
  "assigned", // được thêm làm người đảm nhận
  "unassigned", // bị gỡ khỏi người đảm nhận
  "reminder", // tới mốc nhắc của một mục
] as const
export type CalendarNotificationKind =
  (typeof CALENDAR_NOTIFICATION_KINDS)[number]

// ── Recurrence ──────────────────────────────────────────────────────────────

export const RECURRENCE_EXCEPTION_ACTIONS = ["modified", "cancelled"] as const
export type RecurrenceExceptionAction =
  (typeof RECURRENCE_EXCEPTION_ACTIONS)[number]

// Phạm vi khi sửa/xoá một lần hiện của chuỗi lặp (Mục B `recurring-items`).
export const RECURRENCE_EDIT_SCOPES = [
  "this",
  "thisAndFollowing",
  "all",
] as const
export type RecurrenceEditScope = (typeof RECURRENCE_EDIT_SCOPES)[number]

export const RECURRENCE_EDIT_SCOPE_LABELS: Record<RecurrenceEditScope, string> = {
  this: "Chỉ mục này",
  thisAndFollowing: "Mục này và các mục sau",
  all: "Tất cả các mục",
}

// ── Views (Mục B `calendar-views`) ──────────────────────────────────────────

export const CALENDAR_VIEWS = ["day", "week", "month", "year", "agenda"] as const
export type CalendarView = (typeof CALENDAR_VIEWS)[number]

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
  year: "Năm",
  agenda: "Lịch biểu",
}

// Phím tắt đổi khung nhìn (Mục B `calendar-views` — "d/w/m/y/a").
export const CALENDAR_VIEW_HOTKEYS: Record<string, CalendarView> = {
  d: "day",
  w: "week",
  m: "month",
  y: "year",
  a: "agenda",
}

// ── Member role (đọc lại từ users.system_role — Mục C §7 / Open Question 1) ──

export const MEMBER_ROLES = ["manager", "staff"] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  manager: "Trưởng phòng",
  staff: "Nhân sự",
}

// ── Bảng màu định sẵn cho lịch con ──────────────────────────────────────────
// Mục B `team-calendar`: "màu (bắt buộc, chọn từ bảng màu định sẵn)".
// Mục C §1: `color` là khoá bảng màu, vd "tomato".

export const CALENDAR_COLOR_KEYS = [
  "tomato",
  "flamingo",
  "tangerine",
  "banana",
  "sage",
  "basil",
  "peacock",
  "blueberry",
  "lavender",
  "grape",
  "graphite",
] as const
export type CalendarColorKey = (typeof CALENDAR_COLOR_KEYS)[number]

export const CALENDAR_COLORS: Record<
  CalendarColorKey,
  { label: string; hex: string }
> = {
  tomato: { label: "Đỏ cà chua", hex: "#d50000" },
  flamingo: { label: "Hồng flamingo", hex: "#e67c73" },
  tangerine: { label: "Cam", hex: "#f4511e" },
  banana: { label: "Vàng chuối", hex: "#f6bf26" },
  sage: { label: "Xanh xô thơm", hex: "#33b679" },
  basil: { label: "Xanh húng quế", hex: "#0b8043" },
  peacock: { label: "Xanh công", hex: "#039be5" },
  blueberry: { label: "Xanh việt quất", hex: "#3f51b5" },
  lavender: { label: "Tím oải hương", hex: "#7986cb" },
  grape: { label: "Tím nho", hex: "#8e24aa" },
  graphite: { label: "Xám chì", hex: "#616161" },
}

// Màu mặc định cho lịch cá nhân mới (Mục B `team-calendar` — "màu mặc định").
export const DEFAULT_PERSONAL_CALENDAR_COLOR: CalendarColorKey = "peacock"

// ── Query strategy constants (Mục C §1 / §2) ────────────────────────────────

// Ngưỡng spanDays để một mục chuyển sang isLongSpan (Open Question 4 — chốt 45,
// mặc định Design §1). Mục có spanDays <= ngưỡng lưu mảng `dayKeys`; dài hơn thì
// `dayKeys = null`, `isLongSpan = true`, client tải toàn bộ và tự lọc chồng lấn.
export const LONG_SPAN_THRESHOLD_DAYS = 45

// `array-contains-any` của Firestore giới hạn 30 giá trị (Mục C §2 Risk) — client
// chia danh sách ngày của khung nhìn thành các lô ≤ 30.
export const DAY_KEYS_QUERY_BATCH = 30
