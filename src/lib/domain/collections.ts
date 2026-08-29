// Firestore collection ids for the Content Performance Tracker (docs/SPEC.md).
// All top-level (not nested), linked by `project_id` / `content_item_id` /
// `content_item_id` fields per §6.1's flat model.

export const COLLECTIONS = {
  // group 7.1 task 1.2
  users: "users",
  projects: "projects",
  projectMembers: "projectMembers",
  contentItems: "contentItems",
  statusHistory: "statusHistory",
  comments: "comments",
  // group 7.1 task 1.3
  adAccountConnections: "adAccountConnections",
  adsBindings: "adsBindings",
  adsMetrics: "adsMetrics",
  sheetSyncMappings: "sheetSyncMappings",
  syncRuns: "syncRuns",
  syncConflicts: "syncConflicts",
  // group 7.6 task 6.1 — Google refresh token per manager (SPEC §6.3; not in
  // the §6.1 sketch, which has no store for it)
  googleConnections: "googleConnections",
  notifications: "notifications",
  notificationPreferences: "notificationPreferences",
} as const

export type CollectionId = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]
