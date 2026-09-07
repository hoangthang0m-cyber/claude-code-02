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
  notifications: "notifications",
  notificationPreferences: "notificationPreferences",
  // project-grouping change task 1.1 — folder-style grouping over Project
  projectGroups: "projectGroups",
  // campaign-page-reference-links — labelled links on a project / content item
  referenceLinks: "referenceLinks",
  // ads-overview-reporting change — product-organised Meta Ads reporting.
  // group 1 tasks 1.1–1.5. All server-written; client read-only.
  products: "products",
  productAccountRules: "productAccountRules",
  campaignProductOverrides: "campaignProductOverrides",
  adsInsightSnapshots: "adsInsightSnapshots",
  adCreativeInsightSnapshots: "adCreativeInsightSnapshots",
  adAccountReportSyncStates: "adAccountReportSyncStates",
  reportingSettings: "reportingSettings",
  currencyRates: "currencyRates",
} as const

export type CollectionId = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]
