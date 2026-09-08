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

// project-grouping change task 1.1 — a ProjectGroup is a plain folder; its only
// lifecycle is active vs archived (design.md Decision 1). No "done" state.
export const PROJECT_GROUP_LIFECYCLES = ["active", "archived"] as const
export type ProjectGroupLifecycle = (typeof PROJECT_GROUP_LIFECYCLES)[number]

export const PROJECT_GROUP_LIFECYCLE_LABELS: Record<
  ProjectGroupLifecycle,
  string
> = {
  active: "Hoạt động",
  archived: "Lưu trữ",
}

// knowledge-base change (design.md Decision 1) — a knowledge entry is active or
// archived; archived = hidden from the default list + read-only (no "done").
export const KNOWLEDGE_LIFECYCLES = ["active", "archived"] as const
export type KnowledgeLifecycle = (typeof KNOWLEDGE_LIFECYCLES)[number]

export const KNOWLEDGE_LIFECYCLE_LABELS: Record<KnowledgeLifecycle, string> = {
  active: "Hoạt động",
  archived: "Lưu trữ",
}

// The three body sections that can carry external links — đầu mục 3 / 4 / 5.
export const KNOWLEDGE_LINK_SECTIONS = [
  "detail",
  "process",
  "conclusion",
] as const
export type KnowledgeLinkSection = (typeof KNOWLEDGE_LINK_SECTIONS)[number]

export const KNOWLEDGE_LINK_SECTION_LABELS: Record<KnowledgeLinkSection, string> =
  {
    detail: "Mô tả chi tiết",
    process: "Quá trình đúc kết",
    conclusion: "Đúc kết",
  }

// A "Quá trình đúc kết" reference points at a Project or a ProjectGroup.
export const KNOWLEDGE_PROJECT_REF_TYPES = ["project", "project_group"] as const
export type KnowledgeProjectRefType =
  (typeof KNOWLEDGE_PROJECT_REF_TYPES)[number]

export const KNOWLEDGE_PROJECT_REF_TYPE_LABELS: Record<
  KnowledgeProjectRefType,
  string
> = {
  project: "Dự án",
  project_group: "Nhóm dự án",
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

// ── Ads-overview reporting (ads-overview-reporting change, group 1) ──────────

// A campaign-day / ad-day snapshot is synced for one of two scopes.
export const AD_REPORT_SYNC_SCOPES = ["campaign", "ad"] as const
export type AdReportSyncScope = (typeof AD_REPORT_SYNC_SCOPES)[number]

// Result of a background sync run (ads-overview-reporting
// AdAccountReportSyncState.last_result).
export const SYNC_RESULTS = ["ok", "warning", "error"] as const
export type SyncResult = (typeof SYNC_RESULTS)[number]

// ── Notifications (SPEC §5.7, group 7.1 task 1.3) ────────────────────────────

// Preference groups the user can toggle (SPEC §5.7 R4). The "sync" group is
// gone with Google Sheets sync (campaign-page-reference-links).
export const NOTIFICATION_GROUPS = [
  "assignment",
  "approval",
  "overdue",
  "ads",
  "comment_mention",
] as const
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number]

export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroup, string> = {
  assignment: "Giao việc",
  approval: "Duyệt / trả lại",
  overdue: "Quá hạn",
  ads: "Ads",
  comment_mention: "Bình luận / nhắc tên",
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
}
