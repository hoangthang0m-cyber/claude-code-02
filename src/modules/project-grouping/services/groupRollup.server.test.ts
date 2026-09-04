import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    groups: {} as Record<string, Record<string, unknown>>,
    memberships: [] as Array<{ project_id: string; project_role: string }>,
    projects: [] as Array<Record<string, unknown> & { id: string }>,
    items: [] as Array<Record<string, unknown> & { id: string }>,
    history: [] as Array<Record<string, unknown>>,
    metrics: [] as Array<Record<string, unknown> & { id: string }>,
  },
}))

const ts = (ms: number) => ({ toMillis: () => ms })

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: Array<[string, unknown]>) => ({
    where: (f: string, _op: string, v: unknown) =>
      query(name, [...clauses, [f, v]]),
    get: async () => {
      const val = (f: string) => clauses.find(([k]) => k === f)?.[1]
      const inVals = (f: string): string[] | null => {
        const v = val(f)
        return Array.isArray(v) ? (v as string[]) : null
      }
      if (name === "projectMembers") {
        return { docs: fx.memberships.map((m) => ({ data: () => m })) }
      }
      if (name === "projects") {
        const gid = val("group_id")
        const docs =
          gid === undefined
            ? fx.projects
            : fx.projects.filter((p) => (p.group_id ?? null) === gid)
        return { docs: docs.map((p) => ({ id: p.id, data: () => p })) }
      }
      if (name === "contentItems") {
        const s = inVals("project_id") ?? []
        return {
          docs: fx.items
            .filter((i) => s.includes(String(i.project_id)))
            .map((i) => ({ id: i.id, data: () => i })),
        }
      }
      if (name === "statusHistory") {
        const s = inVals("content_item_id") ?? []
        return {
          docs: fx.history
            .filter((h) => s.includes(String(h.content_item_id)))
            .map((h, i) => ({ id: `h${i}`, data: () => h })),
        }
      }
      if (name === "adsMetrics") {
        const s = inVals("content_item_id") ?? []
        return {
          docs: fx.metrics
            .filter((m) => s.includes(String(m.content_item_id)))
            .map((m) => ({ id: m.id, data: () => m })),
        }
      }
      return { docs: [] }
    },
  })
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id: string) => ({
          id,
          get: async () => {
            const store =
              name === "projectGroups"
                ? fx.groups
                : Object.fromEntries(fx.projects.map((p) => [p.id, p]))
            return { exists: id in store, data: () => store[id] }
          },
        }),
      }),
    }),
    getAdminAuth: () => ({}),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  getGroupDashboard,
  getGroupPeriodReport,
  getGroupReportPerProject,
} from "@/modules/project-grouping/services/groupRollup.server"
import { groupReportCsvRows } from "@/modules/project-grouping/services/groupRollupExport"

const mgr: AuthedUser = { uid: "mgr", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "st", email: null, system_role: "staff" }

const SEP = Date.UTC(2026, 8, 1) - 7 * 3600 * 1000

beforeEach(() => {
  fx.groups = { gUGC: { name: "UGC ROAS 2.0", lifecycle: "active" } }
  fx.memberships = [
    { project_id: "p1", project_role: "manager" },
    { project_id: "p2", project_role: "manager" },
    { project_id: "p3", project_role: "staff" }, // viewer is only staff here
  ]
  fx.projects = [
    { id: "p1", name: "Dự án 1", group_id: "gUGC" },
    { id: "p2", name: "Dự án 2", group_id: "gUGC" },
    { id: "p3", name: "Dự án 3", group_id: "gUGC" }, // in group, NOT managed
    { id: "p9", name: "Ngoài nhóm", group_id: null },
  ]
  fx.items = []
  fx.history = []
  fx.metrics = []
})

describe("group roll-up scope (task 5.1 / 5.2)", () => {
  it("404 when the group does not exist", async () => {
    await expect(getGroupDashboard(mgr, "ghost")).rejects.toMatchObject({
      status: 404,
    })
  })

  it("403 when the viewer manages no project (no dept view for staff)", async () => {
    fx.memberships = [{ project_id: "p1", project_role: "staff" }]
    await expect(getGroupDashboard(staff, "gUGC")).rejects.toMatchObject({
      status: 403,
    })
  })

  it("counts only the managed child projects, and reports N/M", async () => {
    fx.items = [
      { id: "a", project_id: "p1", status: "viet_kich_ban" },
      { id: "b", project_id: "p2", status: "da_len_ads" },
      { id: "c", project_id: "p3", status: "quay_dung" }, // p3 not managed → ignored
    ]
    const r = await getGroupDashboard(mgr, "gUGC")
    expect(r.projects_counted).toBe(2)
    expect(r.projects_total).toBe(3)
    expect(r.group).toEqual({ id: "gUGC", name: "UGC ROAS 2.0" })
    expect(r.total).toBe(2) // a + b, not c
    expect(r.project_ids.sort()).toEqual(["p1", "p2"])
  })
})

describe("group period report (task 5.3)", () => {
  it("an empty group → group_empty true, has_data false", async () => {
    fx.groups = { gEmpty: { name: "Rỗng", lifecycle: "active" } }
    fx.projects = [{ id: "p9", name: "x", group_id: null }]
    const r = await getGroupPeriodReport(mgr, "gEmpty", "month", "2026-09-15")
    expect(r.group_empty).toBe(true)
    expect(r.projects_total).toBe(0)
    expect(r.has_data).toBe(false)
  })

  it("rolls up the metrics over the managed children", async () => {
    fx.items = [
      { id: "a", project_id: "p1", code: "A", deadline: ts(SEP + 20 * 86400000) },
      { id: "b", project_id: "p2", code: "B", deadline: ts(SEP + 20 * 86400000) },
    ]
    fx.history = [
      { content_item_id: "a", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP + 3 * 86400000) },
      { content_item_id: "b", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP + 4 * 86400000) },
    ]
    fx.metrics = [
      { id: "ma", content_item_id: "a", source: "synced", spend: 100, messages: 2, roas: 3, ctr: 0, cost_per_purchase: 0, delivery_status: "active", captured_at: ts(9e12), data_as_of: ts(0) },
      { id: "mb", content_item_id: "b", source: "synced", spend: 300, messages: 6, roas: 5, ctr: 0, cost_per_purchase: 0, delivery_status: "active", captured_at: ts(9e12), data_as_of: ts(0) },
    ]
    const r = await getGroupPeriodReport(mgr, "gUGC", "month", "2026-09-15")
    expect(r.has_data).toBe(true)
    expect(r.throughput).toBe(2)
    expect(r.total_spend).toBe(400)
    expect(r.projects_counted).toBe(2)
  })
})

describe("group CSV per-project breakdown (task 5.5)", () => {
  it("one column per managed child, one row per metric, no group total", async () => {
    fx.items = [{ id: "a", project_id: "p1", code: "A", deadline: ts(SEP + 20 * 86400000) }]
    fx.history = [
      { content_item_id: "a", from_status: "da_duyet", to_status: "da_len_ads", created_at: ts(SEP + 3 * 86400000) },
    ]
    const per = await getGroupReportPerProject(mgr, "gUGC", "month", "2026-09-15")
    expect(per.projects.map((p) => p.id)).toEqual(["p1", "p2"])

    const rows = groupReportCsvRows(per)
    expect(rows[3]).toEqual(["Chỉ số", "Dự án 1", "Dự án 2"]) // header
    // a metric row: label + one value per project
    const throughputRow = rows.find((row) => row[0] === "Số hạng mục lên ads (throughput)")
    expect(throughputRow).toEqual(["Số hạng mục lên ads (throughput)", 1, 0])
    // no "Tổng nhóm" anywhere
    expect(rows.flat().some((c) => String(c).includes("Tổng nhóm"))).toBe(false)
  })
})
