import { beforeEach, describe, expect, it, vi } from "vitest"

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
    get: async () => ({ exists: col(name).has(id), id, data: () => col(name).get(id) }),
    set: async (d: Doc) => void col(name).set(id, d),
    update: async (d: Doc) => void col(name).set(id, { ...(col(name).get(id) ?? {}), ...d }),
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
        ops.push(() => col(r.name).set(r.id, { ...(col(r.name).get(r.id) ?? {}), ...d })),
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
  addReferenceLink,
  deleteReferenceLink,
  listReferenceLinks,
  reorderReferenceLinkList,
  updateReferenceLink,
} from "@/modules/reference-links/services/referenceLinks.server"

const staff: AuthedUser = { uid: "staff-1", email: null, system_role: "staff" }
const outsider: AuthedUser = { uid: "nobody", email: null, system_role: "manager" }

beforeEach(() => {
  store.clear()
  idc = 0
  // staff-1 is a member of project P1
  col("projectMembers").set("P1__staff-1", {
    project_id: "P1",
    user_id: "staff-1",
    project_role: "staff",
  })
  col("contentItems").set("CI1", { project_id: "P1", code: "V1" })
})

describe("addReferenceLink (task 3.1 / 3.4 / 3.5)", () => {
  it("a project member adds a link with a label", async () => {
    const r = await addReferenceLink(staff, {
      owner_type: "project",
      owner_id: "P1",
      url: "https://docs.google.com/spreadsheets/d/x/edit",
      label: "Timeline",
    })
    expect(r.id).toBeTruthy()
    const [link] = [...col("referenceLinks").values()]
    expect(link).toMatchObject({ owner_id: "P1", label: "Timeline", sort_index: 100, created_by: "staff-1" })
  })

  it("rejects a missing label (400)", async () => {
    await expect(
      addReferenceLink(staff, { owner_type: "project", owner_id: "P1", url: "https://x.com" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects a non-http url (400) — no Google API involved", async () => {
    await expect(
      addReferenceLink(staff, { owner_type: "project", owner_id: "P1", url: "ftp://x", label: "x" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects a non-member of the owning project (403)", async () => {
    await expect(
      addReferenceLink(outsider, {
        owner_type: "project",
        owner_id: "P1",
        url: "https://x.com",
        label: "x",
      })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("resolves a content_item owner to its project for the permission check", async () => {
    const r = await addReferenceLink(staff, {
      owner_type: "content_item",
      owner_id: "CI1",
      url: "https://x.com/doc",
      label: "Kịch bản gốc",
    })
    expect(r.id).toBeTruthy()
    await expect(
      addReferenceLink(outsider, {
        owner_type: "content_item",
        owner_id: "CI1",
        url: "https://x.com",
        label: "x",
      })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("appends after the current max sort_index and flags > 20 (task 3.6)", async () => {
    for (let i = 0; i < 20; i++) {
      col("referenceLinks").set(`L${i}`, {
        owner_type: "project",
        owner_id: "P1",
        url: "https://x",
        label: `L${i}`,
        sort_index: (i + 1) * 100,
      })
    }
    const r = await addReferenceLink(staff, {
      owner_type: "project",
      owner_id: "P1",
      url: "https://x.com",
      label: "số 21",
    })
    expect(r.over_warn_limit).toBe(true)
    expect(col("referenceLinks").get(r.id)?.sort_index).toBe(2100)
  })
})

describe("list / update / delete (task 3.2 / 3.3 / 3.5)", () => {
  it("lists an owner's links ordered by sort_index", async () => {
    col("referenceLinks").set("b", { owner_type: "project", owner_id: "P1", url: "https://b", label: "B", sort_index: 200 })
    col("referenceLinks").set("a", { owner_type: "project", owner_id: "P1", url: "https://a", label: "A", sort_index: 100 })
    const { links, over_warn_limit } = await listReferenceLinks(staff, "project", "P1")
    expect(links.map((l) => l.label)).toEqual(["A", "B"])
    expect(over_warn_limit).toBe(false)
  })

  it("a staff member can edit and delete (not manager-only)", async () => {
    col("referenceLinks").set("x", { owner_type: "project", owner_id: "P1", url: "https://x", label: "X", sort_index: 100 })
    await updateReferenceLink(staff, "x", { label: "X mới" })
    expect(col("referenceLinks").get("x")?.label).toBe("X mới")
    await deleteReferenceLink(staff, "x")
    expect(col("referenceLinks").has("x")).toBe(false)
  })

  it("reorder rewrites sort_index; rejects a mismatched id set", async () => {
    col("referenceLinks").set("a", { owner_type: "project", owner_id: "P1", url: "https://a", label: "A", sort_index: 100 })
    col("referenceLinks").set("b", { owner_type: "project", owner_id: "P1", url: "https://b", label: "B", sort_index: 200 })
    await reorderReferenceLinkList(staff, {
      owner_type: "project",
      owner_id: "P1",
      ordered_ids: ["b", "a"],
    })
    expect(col("referenceLinks").get("b")?.sort_index).toBe(100)
    expect(col("referenceLinks").get("a")?.sort_index).toBe(200)

    await expect(
      reorderReferenceLinkList(staff, {
        owner_type: "project",
        owner_id: "P1",
        ordered_ids: ["a"],
      })
    ).rejects.toMatchObject({ status: 400 })
  })
})
