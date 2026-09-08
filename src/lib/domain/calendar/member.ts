import type { Timestamp } from "firebase/firestore"

import type { MemberRole } from "@/lib/domain/calendar/enums"

// members/{uid} — a read-fast copy of the marketing-team directory for the
// calendar (Mục C §1, §7). Doc id = Firebase Auth uid.
//
// Open Question 1 (answered): the source is the existing `users` collection
// (`name`, `email`, `system_role`, `avatar`). `users` has no `active` flag, so
// every `users` doc maps to an active member; deactivation, if ever needed, is
// done directly on `members`. The sync runs on login (extend
// `upsertUserProfile`) plus a nightly `/api/jobs/members-reconcile`
// (spec doc answer #2) — there is no Cloud Function `onWrite` trigger.
export interface Member {
  uid: string
  displayName: string
  photoURL: string | null
  role: MemberRole
  active: boolean
  // Beyond the Mục C §1 sketch: set by the sync so `members-reconcile` can tell
  // fresh docs from stale ones.
  updatedAt: Timestamp
}

// The subset the sync projects from a `users` doc (everything except `updatedAt`,
// which is `serverTimestamp()`).
export interface MemberSyncInput {
  uid: string
  displayName: string
  photoURL: string | null
  role: MemberRole
  active: boolean
}

// Fallback initials for the assignee chip when there is no photoURL
// (Mục B `item-assignees` — "ảnh đại diện hoặc tên viết tắt").
export function memberInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
