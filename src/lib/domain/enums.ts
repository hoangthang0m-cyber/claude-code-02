// Enums for the Content Performance Tracker data model (docs/SPEC.md §6.1).
// Values are the literal strings stored in Firestore — the server rejects
// anything outside these sets (same treatment as `status`, SPEC §5.5 R1).
//
// This file covers checklist group 7.1 tasks 1.2 and 1.3.

export const SYSTEM_ROLES = ["manager", "staff"] as const
export type SystemRole = (typeof SYSTEM_ROLES)[number]

export const PROJECT_ROLES = ["manager", "staff"] as const
export type ProjectRole = (typeof PROJECT_ROLES)[number]

export const SKILL_TAGS = ["content", "ads"] as const
export type SkillTag = (typeof SKILL_TAGS)[number]

export const PROJECT_LIFECYCLES = ["running", "done", "archived"] as const
export type ProjectLifecycle = (typeof PROJECT_LIFECYCLES)[number]

export const PROJECT_LIFECYCLE_LABELS: Record<ProjectLifecycle, string> = {
  running: "Đang chạy",
  done: "Hoàn thành",
  archived: "Lưu trữ",
}

export const SKILL_TAG_LABELS: Record<SkillTag, string> = {
  content: "Content",
  ads: "Ads",
}

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  manager: "Trưởng phòng",
  staff: "Nhân sự",
}

// Production status machine, in order (SPEC §5.3). Transitions live in
// src/lib/workflow/ (task 4.1), not here.
export const CONTENT_STATUSES = [
  "chua_bat_dau",
  "viet_kich_ban",
  "cho_duyet_kich_ban",
  "quay_dung",
  "cho_duyet_video",
  "da_duyet",
  "da_len_ads",
] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  chua_bat_dau: "Chưa bắt đầu",
  viet_kich_ban: "Viết kịch bản",
  cho_duyet_kich_ban: "Chờ duyệt kịch bản",
  quay_dung: "Quay/Dựng",
  cho_duyet_video: "Chờ duyệt video",
  da_duyet: "Đã duyệt",
  da_len_ads: "Đã lên ads",
}

// Content format label (SPEC §8 Q3, answered 2026-08-27: fixed enum, optional
// on create, two-way Google Sheets sync like `topic`).
export const CONTENT_FORMATS = ["reels", "tvc", "photo"] as const
export type ContentFormat = (typeof CONTENT_FORMATS)[number]

export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  reels: "Reels",
  tvc: "TVC",
  photo: "Photo",
}

// ── Ads performance (SPEC §6.1, group 7.1 task 1.3) ───────────────────────────

export const AD_ACCOUNT_STATES = ["connected", "needs_reconnect"] as const
export type AdAccountState = (typeof AD_ACCOUNT_STATES)[number]

export const ADS_OBJECT_LEVELS = ["campaign", "adset", "ad"] as const
export type AdsObjectLevel = (typeof ADS_OBJECT_LEVELS)[number]

export const ADS_METRIC_SOURCES = ["synced", "manual"] as const
export type AdsMetricSource = (typeof ADS_METRIC_SOURCES)[number]

export const ADS_DELIVERY_STATUSES = [
  "active",
  "paused",
  "completed",
  "unknown",
] as const
export type AdsDeliveryStatus = (typeof ADS_DELIVERY_STATUSES)[number]

// ── Sheets sync (SPEC §6.1, group 7.1 task 1.3) ──────────────────────────────

export const SYNC_KINDS = ["sheets", "ads"] as const
export type SyncKind = (typeof SYNC_KINDS)[number]

export const SYNC_RESULTS = ["ok", "warning", "error"] as const
export type SyncResult = (typeof SYNC_RESULTS)[number]

export const SYNC_CONFLICT_RULES = ["system_wins", "sheet_wins"] as const
export type SyncConflictRule = (typeof SYNC_CONFLICT_RULES)[number]

export const SYNC_CONFLICT_SIDES = ["system", "sheet"] as const
export type SyncConflictSide = (typeof SYNC_CONFLICT_SIDES)[number]

// A manager's Google OAuth connection (SPEC §6.3, task 6.1). Same two states as
// an ad-account connection.
export const GOOGLE_CONNECTION_STATES = [
  "connected",
  "needs_reconnect",
] as const
export type GoogleConnectionState =
  (typeof GOOGLE_CONNECTION_STATES)[number]

// ── Notifications (SPEC §5.7, group 7.1 task 1.3) ────────────────────────────

// Preference groups the user can toggle (SPEC §5.7 R4).
export const NOTIFICATION_GROUPS = [
  "assignment",
  "approval",
  "overdue",
  "ads",
  "comment_mention",
  "sync",
] as const
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number]

// SPEC §5.7 R4 spells the toggle list: giao việc, duyệt, quá hạn, ads,
// bình luận/mention, đồng bộ.
export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroup, string> = {
  assignment: "Giao việc",
  approval: "Duyệt / trả lại",
  overdue: "Quá hạn",
  ads: "Ads",
  comment_mention: "Bình luận / nhắc tên",
  sync: "Đồng bộ",
}

// Event types (SPEC §5.7 R1 event → recipient table).
export const NOTIFICATION_TYPES = [
  "content_assigned",
  "review_requested",
  "review_approved",
  "review_returned",
  "content_overdue",
  "ads_stopped",
  "comment_added",
  "comment_mention",
  "sync_issue",
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_TYPE_GROUP: Record<
  NotificationType,
  NotificationGroup
> = {
  content_assigned: "assignment",
  review_requested: "approval",
  review_approved: "approval",
  review_returned: "approval",
  content_overdue: "overdue",
  ads_stopped: "ads",
  comment_added: "comment_mention",
  comment_mention: "comment_mention",
  sync_issue: "sync",
}
