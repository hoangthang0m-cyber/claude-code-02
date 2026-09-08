import { beforeEach, describe, expect, it, vi } from "vitest"

// Stateful Firestore fake (header pattern from referenceLinks.server.test.ts).
type Doc = Record<string, unknown>
const store = new Map<string, Map<string, Doc>>()
const col = (n: string) => {
  if (!store.has(n)) store.set(n, new Map())
  return store.get(n)!
}
type Filter = [string, string, unknown]
const matches = (d: Doc, fs: Filter[]) =>
  fs.every(([f, op, v]) => (op === "==" ? d[f] === v : true))

let idc = 0
function q(name: string, fs: Filter[]) {
  return {
    where: (f: string, o: string, v: unknown) => q(name, [...fs, [f, o, v]]),
    limit: () => q(name, fs),
    get: async () => {
      const docs = [...col(name).entries()]
        .filter(([, d]) => matches(d, fs))
        .map(([id, d]) => ({ id, ref: ref(name, id), data: () => d }))
      return { docs, empty: docs.length === 0, size: docs.length }
    },
  }
}
function ref(name: string, id: string) {
  return {
    id,
    name,
    get: async () => ({
      exists: col(name).has(id),
      id,
      data: () => col(name).get(id),
    }),
    set: async (d: Doc) => void col(name).set(id, d),
    update: async (d: Doc) =>
      void col(name).set(id, { ...(col(name).get(id) ?? {}), ...d }),
    delete: async () => void col(name).delete(id),
  }
}
const fakeDb = {
  collection: (name: string) => ({
    ...q(name, []),
    doc: (id?: string) => ref(name, id ?? `${name}-${++idc}`),
  }),
  batch: () => {
    const ops: Array<() => void> = []
    return {
      update: (r: { name: string; id: string }, d: Doc) =>
        ops.push(() =>
          col(r.name).set(r.id, { ...(col(r.name).get(r.id) ?? {}), ...d })
        ),
      delete: (r: { name: string; id: string }) =>
        ops.push(() => col(r.name).delete(r.id)),
      commit: async () => ops.forEach((f) => f()),
    }
  },
}
vi.mock("@/lib/server/firebaseAdmin", () => ({ getAdminDb: () => fakeDb }))
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__ts__" },
}))

import type { AuthedUser } from "@/lib/server/auth"
import {
  addKnowledgeLink,
  addKnowledgeProjectRef,
  createKnowledgeEntry,
  deleteKnowledgeEntry,
  deleteKnowledgeLink,
  deleteKnowledgeProjectRef,
  reorderKnowledgeLinks,
  setKnowledgeEntryLifecycle,
  updateKnowledgeEntry,
  updateKnowledgeLink,
} from "@/modules/knowledge/services/knowledge.server"

const staff: AuthedUser = { uid: "u-staff", email: null, system_role: "staff" }
const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }

beforeEach(() => {
  store.clear()
  idc = 0
})

const seedEntry = (over: Doc = {}) => {
  const id = "e1"
  col("knowledgeEntries").set(id, {
    name: "Cách viết content ra đơn",
    overview: "reels bán hàng",
    lifecycle: "active",
    created_by: "someone",
    ...over,
  })
  return id
}

// ── group 2: entry CRUD + lifecycle ──────────────────────────────────────
describe("createKnowledgeEntry (task 2.1)", () => {
  it("a staff member creates an entry: lifecycle active, created_by, timestamps", async () => {
    const r = await createKnowledgeEntry(staff, {
      name: "  Tri thức A  ",
      overview: "tổng quan",
      detail_note: "chi tiết",
    })
    expect(r.id).toMatch(/^knowledgeEntries-/)
    const d = col("knowledgeEntries").get(r.id)!
    expect(d).toMatchObject({
      name: "Tri thức A",
      overview: "tổng quan",
      detail_note: "chi tiết",
      process_note: null,
      conclusion_note: null,
      lifecycle: "active",
      created_by: "u-staff",
      updated_by: "u-staff",
    })
  })

  it("rejects a missing name or overview with 400", async () => {
    await expect(
      createKnowledgeEntry(staff, { overview: "x" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      createKnowledgeEntry(staff, { name: "x" })
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("updateKnowledgeEntry (task 2.2)", () => {
  it("a staff member edits content; stamps updated_by / updated_at", async () => {
    const id = seedEntry()
    await updateKnowledgeEntry(staff, id, { overview: "tổng quan mới" })
    const d = col("knowledgeEntries").get(id)!
    expect(d.overview).toBe("tổng quan mới")
    expect(d.updated_by).toBe("u-staff")
    expect(d.updated_at).toBe("__ts__")
  })

  it("404 when the entry is missing", async () => {
    await expect(
      updateKnowledgeEntry(staff, "nope", { name: "x" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("409 when the entry is archived (read-only)", async () => {
    const id = seedEntry({ lifecycle: "archived" })
    await expect(
      updateKnowledgeEntry(staff, id, { name: "x" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("400 on an empty body or a blanked name", async () => {
    const id = seedEntry()
    await expect(updateKnowledgeEntry(staff, id, {})).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      updateKnowledgeEntry(staff, id, { name: "   " })
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("setKnowledgeEntryLifecycle (task 2.3)", () => {
  it("staff → 403", async () => {
    const id = seedEntry()
    await expect(
      setKnowledgeEntryLifecycle(staff, id, { lifecycle: "archived" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("manager archives then restores", async () => {
    const id = seedEntry()
    const a = await setKnowledgeEntryLifecycle(mgr, id, { lifecycle: "archived" })
    expect(a).toEqual({ id, lifecycle: "archived" })
    expect(col("knowledgeEntries").get(id)!.lifecycle).toBe("archived")
    await setKnowledgeEntryLifecycle(mgr, id, { lifecycle: "active" })
    expect(col("knowledgeEntries").get(id)!.lifecycle).toBe("active")
  })

  it("400 when already in that state", async () => {
    const id = seedEntry()
    await expect(
      setKnowledgeEntryLifecycle(mgr, id, { lifecycle: "active" })
    ).rejects.toMatchObject({ status: 400 })
  })
})

describe("deleteKnowledgeEntry (task 2.4)", () => {
  it("staff → 403", async () => {
    const id = seedEntry()
    await expect(
      deleteKnowledgeEntry(staff, id, { confirm_name: "Cách viết content ra đơn" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("400 when confirm_name does not match", async () => {
    const id = seedEntry()
    await expect(
      deleteKnowledgeEntry(mgr, id, { confirm_name: "Sai tên" })
    ).rejects.toMatchObject({ status: 400 })
    expect(col("knowledgeEntries").has(id)).toBe(true)
  })

  it("cascades: removes the entry, its links and its refs; returns counts", async () => {
    const id = seedEntry()
    await addKnowledgeLink(staff, id, {
      section: "detail",
      url: "https://x/1",
      label: "a",
    })
    await addKnowledgeLink(staff, id, {
      section: "process",
      url: "https://x/2",
      label: "b",
    })
    col("projects").set("p1", { name: "Dự án 1" })
    await addKnowledgeProjectRef(staff, id, { ref_type: "project", ref_id: "p1" })

    const r = await deleteKnowledgeEntry(mgr, id, {
      confirm_name: "Cách viết content ra đơn",
    })
    expect(r).toEqual({ id, links_removed: 2, refs_removed: 1 })
    expect(col("knowledgeEntries").has(id)).toBe(false)
    expect(col("knowledgeLinks").size).toBe(0)
    expect(col("knowledgeProjectRefs").size).toBe(0)
  })
})

// ── group 3: section links ───────────────────────────────────────────────
describe("knowledge links (tasks 3.1–3.3)", () => {
  it("sort_index increments within each section; over_warn_limit past 20", async () => {
    const id = seedEntry()
    const a = await addKnowledgeLink(staff, id, {
      section: "detail",
      url: "https://x/a",
      label: "a",
    })
    const b = await addKnowledgeLink(staff, id, {
      section: "detail",
      url: "https://x/b",
      label: "b",
    })
    const c = await addKnowledgeLink(staff, id, {
      section: "process",
      url: "https://x/c",
      label: "c",
    })
    expect(col("knowledgeLinks").get(a.id)!.sort_index).toBe(100)
    expect(col("knowledgeLinks").get(b.id)!.sort_index).toBe(200)
    expect(col("knowledgeLinks").get(c.id)!.sort_index).toBe(100) // new section
    expect(a.over_warn_limit).toBe(false)

    for (let i = 0; i < 19; i++) {
      // eslint-disable-next-line no-await-in-loop
      await addKnowledgeLink(staff, id, {
        section: "detail",
        url: `https://x/n${i}`,
        label: `n${i}`,
      })
    }
    const twentyFirst = await addKnowledgeLink(staff, id, {
      section: "detail",
      url: "https://x/last",
      label: "21",
    })
    expect(twentyFirst.over_warn_limit).toBe(true)
  })

  it("rejects a missing label, a bad URL, and an archived entry", async () => {
    const id = seedEntry()
    await expect(
      addKnowledgeLink(staff, id, { section: "detail", url: "https://x/a", label: "" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      addKnowledgeLink(staff, id, {
        section: "detail",
        url: "ftp://x/a",
        label: "a",
      })
    ).rejects.toMatchObject({ status: 400 })

    col("knowledgeEntries").set(id, {
      ...col("knowledgeEntries").get(id),
      lifecycle: "archived",
    })
    await expect(
      addKnowledgeLink(staff, id, {
        section: "detail",
        url: "https://x/a",
        label: "a",
      })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("staff edits a label and removes a link without touching others", async () => {
    const id = seedEntry()
    const a = await addKnowledgeLink(staff, id, {
      section: "detail",
      url: "https://x/a",
      label: "a",
    })
    const b = await addKnowledgeLink(staff, id, {
      section: "detail",
      url: "https://x/b",
      label: "b",
    })
    await updateKnowledgeLink(a.id, { label: "a mới" })
    expect(col("knowledgeLinks").get(a.id)!.label).toBe("a mới")
    await deleteKnowledgeLink(b.id)
    expect(col("knowledgeLinks").has(b.id)).toBe(false)
    expect(col("knowledgeLinks").has(a.id)).toBe(true)
  })

  it("reorder rewrites sort_index; a mismatched id set is rejected", async () => {
    const id = seedEntry()
    const a = await addKnowledgeLink(staff, id, {
      section: "detail",
      url: "https://x/a",
      label: "a",
    })
    const b = await addKnowledgeLink(staff, id, {
      section: "detail",
      url: "https://x/b",
      label: "b",
    })
    await reorderKnowledgeLinks(staff, id, {
      section: "detail",
      ordered_ids: [b.id, a.id],
    })
    expect(col("knowledgeLinks").get(b.id)!.sort_index).toBe(100)
    expect(col("knowledgeLinks").get(a.id)!.sort_index).toBe(200)

    await expect(
      reorderKnowledgeLinks(staff, id, {
        section: "detail",
        ordered_ids: [a.id],
      })
    ).rejects.toMatchObject({ status: 400 })
  })
})

// ── group 4: project / group references ──────────────────────────────────
describe("knowledge project refs (tasks 4.1–4.2)", () => {
  it("snapshots the target's name; 404 when the target does not exist", async () => {
    const id = seedEntry()
    col("projects").set("p1", { name: "UGC ROAS 2.0" })
    col("projectGroups").set("g1", { name: "Nhóm định hướng" })

    const p = await addKnowledgeProjectRef(staff, id, {
      ref_type: "project",
      ref_id: "p1",
    })
    expect(p.ref_name).toBe("UGC ROAS 2.0")
    expect(col("knowledgeProjectRefs").get(p.id)!).toMatchObject({
      entry_id: id,
      ref_type: "project",
      ref_id: "p1",
      ref_name: "UGC ROAS 2.0",
    })

    const g = await addKnowledgeProjectRef(staff, id, {
      ref_type: "project_group",
      ref_id: "g1",
    })
    expect(g.ref_name).toBe("Nhóm định hướng")

    await expect(
      addKnowledgeProjectRef(staff, id, { ref_type: "project", ref_id: "ghost" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("staff detaches a ref; the target project is untouched", async () => {
    const id = seedEntry()
    col("projects").set("p1", { name: "Dự án 1" })
    const r = await addKnowledgeProjectRef(staff, id, {
      ref_type: "project",
      ref_id: "p1",
    })
    await deleteKnowledgeProjectRef(r.id)
    expect(col("knowledgeProjectRefs").has(r.id)).toBe(false)
    expect(col("projects").get("p1")).toEqual({ name: "Dự án 1" })
  })

  it("409 when attaching a ref to an archived entry", async () => {
    const id = seedEntry({ lifecycle: "archived" })
    col("projects").set("p1", { name: "Dự án 1" })
    await expect(
      addKnowledgeProjectRef(staff, id, { ref_type: "project", ref_id: "p1" })
    ).rejects.toMatchObject({ status: 409 })
  })
})
