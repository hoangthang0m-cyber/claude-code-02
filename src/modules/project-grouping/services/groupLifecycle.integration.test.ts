import { beforeEach, describe, expect, it, vi } from "vitest"

// project-grouping change task 6.1 — the full group lifecycle end to end:
// create → assign projects → move a project → archive → delete. A project is
// NEVER deleted and never loses its identity; only `group_id` ever changes.

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

import type { AuthedUser } from "@/lib/server/auth"
import {
  createProjectGroup,
  deleteProjectGroup,
  setProjectGroupLifecycle,
  updateProjectGroup,
} from "@/modules/project-grouping/services/projectGroups.server"
import { setProjectGroup } from "@/modules/project-grouping/services/projectAssignment.server"

const mgr: AuthedUser = { uid: "mgr", email: null, system_role: "manager" }

const projectIds = () => [...store.projects.keys()].sort()
const groupOf = (id: string) => store.projects.get(id)?.group_id ?? null

beforeEach(() => {
  store.projectGroups.clear()
  store.projects.clear()
  store.projects.set("pA", { name: "UGC A", group_id: null, sort_index: 100 })
  store.projects.set("pB", { name: "UGC B", group_id: null, sort_index: 200 })
  store.projects.set("pC", { name: "Khác", group_id: null, sort_index: 300 })
})

describe("group lifecycle end-to-end (task 6.1)", () => {
  it("create → assign → move → archive → delete, projects always survive", async () => {
    // create two groups
    const { id: g1 } = await createProjectGroup(mgr, { name: "UGC ROAS 2.0" })
    const { id: g2 } = await createProjectGroup(mgr, { name: "Định hướng khác" })
    expect(store.projectGroups.get(g1)).toMatchObject({ lifecycle: "active" })

    // assign pA, pB to g1
    await setProjectGroup(mgr, "pA", { group_id: g1 })
    await setProjectGroup(mgr, "pB", { group_id: g1 })
    expect(groupOf("pA")).toBe(g1)
    expect(groupOf("pB")).toBe(g1)
    expect(groupOf("pC")).toBeNull()

    // rename the group — projects untouched
    await updateProjectGroup(mgr, g1, { name: "UGC ROAS 2.0 (Q4)" })
    expect(store.projectGroups.get(g1)).toMatchObject({ name: "UGC ROAS 2.0 (Q4)" })
    expect(projectIds()).toEqual(["pA", "pB", "pC"])

    // move pB from g1 → g2
    await setProjectGroup(mgr, "pB", { group_id: g2 })
    expect(groupOf("pB")).toBe(g2)
    // g1 no longer "contains" pB (membership = a `group_id == g1` filter)
    const g1Members = [...store.projects.entries()]
      .filter(([, d]) => d.group_id === g1)
      .map(([id]) => id)
    expect(g1Members).toEqual(["pA"])

    // archive g1 — its project (pA) keeps running
    await setProjectGroupLifecycle(mgr, g1, { lifecycle: "archived" })
    expect(store.projectGroups.get(g1)).toMatchObject({ lifecycle: "archived" })
    expect(groupOf("pA")).toBe(g1) // still filed there
    expect(store.projects.get("pA")).toMatchObject({ name: "UGC A" }) // intact

    // delete g2 — pB falls back to "Chưa phân nhóm", nothing deleted
    const del = await deleteProjectGroup(mgr, g2)
    expect(del.projects_reassigned).toBe(1)
    expect(store.projectGroups.has(g2)).toBe(false)
    expect(groupOf("pB")).toBeNull()

    // every project still exists
    expect(projectIds()).toEqual(["pA", "pB", "pC"])
  })
})
