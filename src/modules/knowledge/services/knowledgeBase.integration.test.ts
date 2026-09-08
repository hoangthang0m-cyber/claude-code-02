import { beforeEach, describe, expect, it, vi } from "vitest"

// knowledge-base task 9.3 — the whole flow end to end on a stateful fake:
// create → links in 3 sections → 1 project + 1 group ref → edit note → staff
// blocked from delete → manager archives (content mutation now 409) → manager
// deletes (cascade wipes links + refs).

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
  setKnowledgeEntryLifecycle,
  updateKnowledgeEntry,
} from "@/modules/knowledge/services/knowledge.server"

const staff: AuthedUser = { uid: "u-staff", email: null, system_role: "staff" }
const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }

beforeEach(() => {
  store.clear()
  idc = 0
  col("projects").set("p1", { name: "UGC ROAS 2.0" })
  col("projectGroups").set("g1", { name: "Nhóm định hướng UGC" })
})

describe("knowledge-base end to end", () => {
  it("build → reference → archive → delete", async () => {
    // staff creates
    const { id } = await createKnowledgeEntry(staff, {
      name: "Cách viết content ra đơn",
      overview: "Áp dụng cho reels bán hàng",
    })

    // links into all three sections
    for (const section of ["detail", "process", "conclusion"] as const) {
      await addKnowledgeLink(staff, id, {
        section,
        url: `https://docs.google.com/${section}`,
        label: `Tài liệu ${section}`,
      })
    }
    expect(col("knowledgeLinks").size).toBe(3)

    // 1 project + 1 group ref on "Quá trình đúc kết"
    const pRef = await addKnowledgeProjectRef(staff, id, {
      ref_type: "project",
      ref_id: "p1",
    })
    await addKnowledgeProjectRef(staff, id, {
      ref_type: "project_group",
      ref_id: "g1",
    })
    expect(pRef.ref_name).toBe("UGC ROAS 2.0")
    expect(col("knowledgeProjectRefs").size).toBe(2)

    // staff edits a section note
    await updateKnowledgeEntry(staff, id, { process_note: "B1 → B2 → B3" })
    expect(col("knowledgeEntries").get(id)!.process_note).toBe("B1 → B2 → B3")

    // staff cannot delete or archive
    await expect(
      deleteKnowledgeEntry(staff, id, { confirm_name: "Cách viết content ra đơn" })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      setKnowledgeEntryLifecycle(staff, id, { lifecycle: "archived" })
    ).rejects.toMatchObject({ status: 403 })

    // manager archives → the entry is read-only
    await setKnowledgeEntryLifecycle(mgr, id, { lifecycle: "archived" })
    await expect(
      updateKnowledgeEntry(staff, id, { name: "x" })
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      addKnowledgeLink(staff, id, {
        section: "detail",
        url: "https://x/y",
        label: "y",
      })
    ).rejects.toMatchObject({ status: 409 })

    // manager deletes → cascade
    const del = await deleteKnowledgeEntry(mgr, id, {
      confirm_name: "Cách viết content ra đơn",
    })
    expect(del).toEqual({ id, links_removed: 3, refs_removed: 2 })
    expect(col("knowledgeEntries").size).toBe(0)
    expect(col("knowledgeLinks").size).toBe(0)
    expect(col("knowledgeProjectRefs").size).toBe(0)
    // the referenced project + group are untouched
    expect(col("projects").get("p1")).toEqual({ name: "UGC ROAS 2.0" })
    expect(col("projectGroups").get("g1")).toEqual({
      name: "Nhóm định hướng UGC",
    })
  })
})
