import { describe, expect, it, vi } from "vitest"

// SPEC §5.1 R4 / §2 / §6.5, task 9.1: a consolidated check that EVERY
// project-scoped feature rejects someone who is not a member of that project —
// neither acting on nor reading a project's objects across the boundary. Each
// feature has its own 403 test too; this file is the safety net that no entry
// point forgot `requireProjectScope`.

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string) => query(name, [...clauses, f]),
    limit: () => query(name, clauses),
    orderBy: () => query(name, clauses),
    get: async () => ({ empty: true, docs: [], size: 0 }), // outsider: no rows
  })
  const doc = (name: string, id?: string) => ({
    id: id ?? `${name}-x`,
    get: async () => {
      if (name === "contentItems") {
        return {
          exists: true,
          data: () => ({
            project_id: "P",
            status: "quay_dung",
            assignee_id: "insider",
            code: "X",
          }),
        }
      }
      if (name === "projects") {
        return { exists: true, data: () => ({ lifecycle: "running" }) }
      }
      if (name === "sheetSyncMappings") {
        return {
          exists: true,
          data: () => ({
            spreadsheet_id: "s",
            sheet_tab: "t",
            header_row: 1,
            column_map: { code: "Mã" },
          }),
        }
      }
      if (name === "adsBindings") {
        return { exists: true, data: () => ({ content_item_id: "ci", active: true }) }
      }
      return { exists: false, data: () => undefined }
    },
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  })
  return {
    getAdminAuth: () => ({ getUser: async () => ({}) }),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id?: string) => doc(name, id),
      }),
      batch: () => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  bindAd,
  listAdsBindings,
  unbindAd,
} from "@/modules/ads-performance/services/adsBindings.server"
import {
  enterManualMetric,
  getContentMetrics,
} from "@/modules/ads-performance/services/adsMetrics.server"
import {
  createComment,
  listComments,
} from "@/modules/content-pipeline/services/comments.server"
import {
  assignContentItem,
  createContentItem,
  listContentItems,
  setEvaluation,
  updateContentItemFields,
} from "@/modules/content-pipeline/services/content.server"
import {
  addProjectMember,
  listProjectMembers,
  removeProjectMember,
  updateProjectMember,
} from "@/modules/project-workspace/services/members.server"
import {
  changeProjectLifecycle,
  updateProject,
} from "@/modules/project-workspace/services/projects.server"
import {
  executeTransition,
  listStatusHistory,
} from "@/modules/production-workflow/services/workflow.server"
import {
  getSheetMapping,
  previewSheet,
  saveSheetMapping,
  setSheetSyncEnabled,
} from "@/modules/sheets-sync/services/sheetMapping.server"
import {
  getProjectSheetSyncLog,
  syncProjectSheetNow,
} from "@/modules/sheets-sync/services/sheetSync.server"

const outsider: AuthedUser = {
  uid: "u-outsider",
  email: null,
  system_role: "manager", // a global manager is still nothing on a project they don't belong to
}

// [label, invocation] — mutations AND reads.
const CASES: Array<[string, () => Promise<unknown>]> = [
  ["content: list", () => listContentItems(outsider, "P", {})],
  ["content: create", () => createContentItem(outsider, "P", { code: "N" })],
  ["content: update fields", () => updateContentItemFields(outsider, "ci", { topic: "x" })],
  ["content: assign", () => assignContentItem(outsider, "ci", { assignee_id: "u-outsider" })],
  ["content: evaluation", () => setEvaluation(outsider, "ci", { evaluation: "x" })],
  ["workflow: transition", () => executeTransition(outsider, "ci", { to: "cho_duyet_video" })],
  ["workflow: status history", () => listStatusHistory(outsider, "ci")],
  ["comments: list", () => listComments(outsider, "ci")],
  ["comments: create", () => createComment(outsider, "ci", { body: "hi", mentions: [] })],
  ["ads: list bindings", () => listAdsBindings(outsider, "ci")],
  ["ads: bind", () => bindAd(outsider, "ci", { ad_account_id: "act_1", object_type: "campaign", object_id: "1" })],
  ["ads: unbind", () => unbindAd(outsider, "ci", "1")],
  ["ads: manual metric", () => enterManualMetric(outsider, "ci", { roas: 1 })],
  ["ads: get metrics", () => getContentMetrics(outsider, "ci")],
  ["project: update", () => updateProject(outsider, "P", { name: "x" })],
  ["project: lifecycle", () => changeProjectLifecycle(outsider, "P", { lifecycle: "done" })],
  ["members: list", () => listProjectMembers(outsider, "P")],
  ["members: add", () => addProjectMember(outsider, "P", { user_id: "u2", project_role: "staff" })],
  ["members: update", () => updateProjectMember(outsider, "P", "m1", { project_role: "manager" })],
  ["members: remove", () => removeProjectMember(outsider, "P", "m1")],
  ["sheet: get mapping", () => getSheetMapping(outsider, "P")],
  ["sheet: preview", () => previewSheet(outsider, "P", "https://docs.google.com/spreadsheets/d/1/edit", 1)],
  ["sheet: save mapping", () => saveSheetMapping(outsider, "P", { url: "https://docs.google.com/spreadsheets/d/1/edit", header_row: 1, column_map: { code: "Mã" }, conflict_rule: "system_wins" })],
  ["sheet: toggle sync", () => setSheetSyncEnabled(outsider, "P", false)],
  ["sheet: sync now", () => syncProjectSheetNow(outsider, "P")],
  ["sheet: sync log", () => getProjectSheetSyncLog(outsider, "P")],
]

describe("cross-project scope: an outsider is rejected everywhere (SPEC §5.1 R4, task 9.1)", () => {
  it.each(CASES)("%s → 403", async (_label, run) => {
    await expect(run()).rejects.toMatchObject({ status: 403 })
  })
})
