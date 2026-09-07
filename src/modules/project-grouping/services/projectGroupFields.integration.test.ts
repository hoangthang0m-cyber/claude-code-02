import { beforeEach, describe, expect, it, vi } from "vitest"

// project-group-fields group 4 — the new group fields end to end: create / edit
// with the full field set, the objective requirement, the legacy-group path,
// budget reconciliation, and the computed time status.

const { store } = vi.hoisted(() => ({
  store: {
    projectGroups: new Map<string, Record<string, unknown>>(),
    projects: new Map<string, Record<string, unknown>>(),
  } as {
    projectGroups: Map<string, Record<string, unknown>>
    projects: Map<string, Record<string, unknown>>
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  let seq = 0
  const col = (name: keyof typeof store) => store[name]

  const docRef = (name: keyof typeof store, id: string) => ({
    id,
    async get() {
      const data = col(name).get(id)
      return { exists: data !== undefined, data: () => data }
    },
    async set(data: Record<string, unknown>) {
      col(name).set(id, { ...data })
    },
    async update(patch: Record<string, unknown>) {
      col(name).set(id, { ...(col(name).get(id) ?? {}), ...patch })
    },
    async delete() {
      col(name).delete(id)
    },
  })

  const collection = (name: keyof typeof store) => {
    const filtered = (gid?: unknown) =>
      [...col(name).entries()]
        .filter(([, d]) => gid === undefined || (d.group_id ?? null) === gid)
        .map(([id, d]) => ({ id, ref: docRef(name, id), data: () => d }))
    const q = (gid?: unknown) => ({
      where: (f: string, _op: string, v: unknown) =>
        q(f === "group_id" ? v : gid),
      async get() {
        const docs = filtered(gid)
        return { docs, size: docs.length, empty: docs.length === 0 }
      },
    })
    return {
      ...q(),
      doc: (id?: string) => docRef(name, id ?? `${name}-${++seq}`),
    }
  }

  const batchOps: Array<() => void> = []
  return {
    getAdminDb: () => ({
      collection,
      batch: () => ({
        update(ref: { update: (p: unknown) => void }, patch: unknown) {
          batchOps.push(() => ref.update(patch))
        },
        delete(ref: { delete: () => void }) {
          batchOps.push(() => ref.delete())
        },
        async commit() {
          const ops = batchOps.splice(0)
          for (const op of ops) op()
        },
      }),
    }),
    getAdminAuth: () => ({}),
  }
})

import {
  computeGroupBudgetReconciliation,
  computeGroupTimeStatus,
  groupNeedsObjective,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import {
  createProjectGroup,
  setProjectGroupLifecycle,
  updateProjectGroup,
} from "@/modules/project-grouping/services/projectGroups.server"

const mgr: AuthedUser = { uid: "mgr", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "st", email: null, system_role: "staff" }

beforeEach(() => {
  store.projectGroups.clear()
  store.projects.clear()
})

// ── 4.1 — create / edit with the full field set ────────────────────────────
describe("4.1 create / edit a group with the new fields", () => {
  it("stores every field on create and reads them back", async () => {
    const { id } = await createProjectGroup(mgr, {
      name: "UGC ROAS 2.0",
      objective: "Đẩy ROAS toàn nhóm lên 2.0",
      description: "Các đợt UGC cùng định hướng",
      time_scope_text: "3 tháng",
      target_end_date: "2026-12-31",
      budget_amount: 100_000_000,
      budget_currency: "VND",
    })
    expect(store.projectGroups.get(id)).toMatchObject({
      name: "UGC ROAS 2.0",
      objective: "Đẩy ROAS toàn nhóm lên 2.0",
      time_scope_text: "3 tháng",
      target_end_date: "2026-12-31",
      budget_amount: 100_000_000,
      budget_currency: "VND",
      lifecycle: "active",
    })
  })

  it("blocks a create with no objective", async () => {
    await expect(
      createProjectGroup(mgr, { name: "Thiếu mục tiêu" })
    ).rejects.toMatchObject({ status: 400 })
    expect(store.projectGroups.size).toBe(0)
  })

  it("saves a group with a time scope but no target end date; time status hides", async () => {
    const { id } = await createProjectGroup(mgr, {
      name: "Không có ngày kết thúc",
      objective: "o",
      time_scope_text: "vài tuần",
    })
    const g = store.projectGroups.get(id)!
    expect("target_end_date" in g).toBe(false)
    expect(
      computeGroupTimeStatus(
        g.target_end_date as string | undefined,
        Date.now()
      )
    ).toBeNull()
  })

  it("blocks a staff account from creating or editing a group", async () => {
    await expect(
      createProjectGroup(staff, { name: "X", objective: "o" })
    ).rejects.toMatchObject({ status: 403 })

    store.projectGroups.set("g1", { name: "G", objective: "o", lifecycle: "active" })
    await expect(
      updateProjectGroup(staff, "g1", { budget_amount: 1, budget_currency: "VND" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("edits the fields on an existing group", async () => {
    const { id } = await createProjectGroup(mgr, {
      name: "G",
      objective: "cũ",
    })
    await updateProjectGroup(mgr, id, {
      objective: "mới",
      target_end_date: "2027-01-15",
      budget_amount: 50_000_000,
      budget_currency: "VND",
    })
    expect(store.projectGroups.get(id)).toMatchObject({
      objective: "mới",
      target_end_date: "2027-01-15",
      budget_amount: 50_000_000,
      budget_currency: "VND",
    })
  })
})

// ── 4.2 — a legacy group (created before this change) ──────────────────────
describe("4.2 legacy group with no objective", () => {
  beforeEach(() => {
    // a doc shaped like the old project-grouping schema
    store.projectGroups.set("legacy", { name: "Nhóm cũ", lifecycle: "active" })
  })

  it("is flagged as needing an objective", () => {
    expect(groupNeedsObjective(store.projectGroups.get("legacy")!)).toBe(true)
  })

  it("still archives / restores and accepts an objective added later", async () => {
    await setProjectGroupLifecycle(mgr, "legacy", { lifecycle: "archived" })
    expect(store.projectGroups.get("legacy")).toMatchObject({
      lifecycle: "archived",
    })
    await setProjectGroupLifecycle(mgr, "legacy", { lifecycle: "active" })

    await updateProjectGroup(mgr, "legacy", { objective: "Mục tiêu bổ sung" })
    expect(groupNeedsObjective(store.projectGroups.get("legacy")!)).toBe(false)
  })
})

// ── 4.3 — budget reconciliation ───────────────────────────────────────────
describe("4.3 budget reconciliation", () => {
  const within = computeGroupBudgetReconciliation({
    budgetAmount: 100_000_000,
    budgetCurrency: "VND",
    actualSpend: 60_000_000,
  })
  const over = computeGroupBudgetReconciliation({
    budgetAmount: 50_000_000,
    budgetCurrency: "VND",
    actualSpend: 65_500_000,
  })
  const none = computeGroupBudgetReconciliation({
    budgetAmount: null,
    budgetCurrency: null,
    actualSpend: 12_000_000,
  })
  const mismatch = computeGroupBudgetReconciliation({
    budgetAmount: 5_000,
    budgetCurrency: "USD",
    actualSpend: 60_000_000,
  })

  it("within budget → percent used, no overspend", () => {
    expect(within.state).toBe("within")
    if (within.state === "within") {
      expect(Math.round(within.percent_used * 100)).toBe(60)
      expect(within.over_amount).toBe(0)
    }
  })

  it("over budget → overspend amount", () => {
    expect(over.state).toBe("over")
    if (over.state === "over") expect(over.over_amount).toBe(15_500_000)
  })

  it("no budget → nothing to reconcile", () => {
    expect(none).toEqual({ state: "no_budget" })
  })

  it("different currency → not directly comparable", () => {
    expect(mismatch.state).toBe("currency_mismatch")
  })
})

// ── 4.4 — computed time status ────────────────────────────────────────────
describe("4.4 computed time status", () => {
  const now = Date.parse("2026-09-07T09:00:00Z")

  it("still in time", () => {
    expect(computeGroupTimeStatus("2026-10-07", now)).toEqual({
      state: "on_track",
      days_left: 30,
    })
  })

  it("due soon inside the 7-day window", () => {
    expect(computeGroupTimeStatus("2026-09-11", now)).toEqual({
      state: "due_soon",
      days_left: 4,
    })
  })

  it("overdue after the target day", () => {
    expect(computeGroupTimeStatus("2026-09-01", now)).toEqual({
      state: "overdue",
      days_over: 6,
    })
  })

  it("no target end date → no status", () => {
    expect(computeGroupTimeStatus(undefined, now)).toBeNull()
  })
})
