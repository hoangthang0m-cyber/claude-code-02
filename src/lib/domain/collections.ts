// Firestore collection ids for the Content Performance Tracker (docs/SPEC.md).
// All top-level (not nested), linked by `project_id` / `content_item_id` fields
// per §6.1's flat model. Group 7.1 task 1.3 adds the ads / sync / notification
// collections.

export const COLLECTIONS = {
  users: "users",
  projects: "projects",
  projectMembers: "projectMembers",
  contentItems: "contentItems",
  statusHistory: "statusHistory",
  comments: "comments",
} as const

export type CollectionId = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]
