// Enums for the Content Performance Tracker data model (docs/SPEC.md §6.1).
// Values are the literal strings stored in Firestore — the server rejects
// anything outside these sets (same treatment as `status`, SPEC §5.5 R1).
//
// This file covers checklist group 7.1 tasks 1.2. Ads / sheets-sync /
// notification enums are added in task 1.3.

export const SYSTEM_ROLES = ["manager", "staff"] as const
export type SystemRole = (typeof SYSTEM_ROLES)[number]

export const PROJECT_ROLES = ["manager", "staff"] as const
export type ProjectRole = (typeof PROJECT_ROLES)[number]

export const SKILL_TAGS = ["content", "ads"] as const
export type SkillTag = (typeof SKILL_TAGS)[number]

export const PROJECT_LIFECYCLES = ["running", "done", "archived"] as const
export type ProjectLifecycle = (typeof PROJECT_LIFECYCLES)[number]

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
