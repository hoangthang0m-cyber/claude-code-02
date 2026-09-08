import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx, docSet, docUpdate, docDelete } = vi.hoisted(() => ({
  fx: { docs: {} as Record<string, Record<string, unknown>> },
  docSet: vi.fn(),
  docUpdate: vi.fn(),
  docDelete: vi.fn(),
}))

const ts = (ms: number) => ({ toMillis: () => ms })

vi.mock("@/lib/server/firebaseAdmin", () => {
  let counter = 0
  const query = (clauses: Array<[string, unknown]>) => ({
    where: (f: string, _op: string, v: unknown) => query([...clauses, [f, v]]),
    get: async () => {
      const cat = clauses.find(([f]) => f === "category")?.[1]
      const docs = Object.entries(fx.docs)
        .filter(([, d]) => cat === undefined || d.category === cat)
        .map(([id, d]) => ({ id, data: () => d }))
      return { docs }
    },
  })
  return {
    getAdminDb: () => ({
      collection: () => ({
        ...query([]),
        doc: (id?: string) => {
          const docId = id ?? `orgDocuments-${++counter}`
          return {
            id: docId,
            set: docSet,
            update: docUpdate,
            delete: docDelete,
            get: async () => ({
              exists: docId in fx.docs,
              data: () => fx.docs[docId],
            }),
          }
        },
      }),
    }),
    getAdminAuth: () => ({}),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  createOrgDocument,
  deleteOrgDocument,
  listOrgDocuments,
  updateOrgDocument,
} from "@/modules/document-library/services/orgDocuments.server"

const staff: AuthedUser = {
  uid: "u-staff",
  email: "s@hemtarot.vn",
  system_role: "staff",
}
const manager: AuthedUser = {
  uid: "u-mgr",
  email: "m@hemtarot.vn",
  system_role: "manager",
}

const base = {
  category: "meeting_minutes" as const,
  title: "Họp kế hoạch tháng 9",
  url: "https://docs.google.com/document/d/x/edit",
}

beforeEach(() => {
  fx.docs = {}
  docSet.mockReset().mockResolvedValue(undefined)
  docUpdate.mockReset().mockResolvedValue(undefined)
  docDelete.mockReset().mockResolvedValue(undefined)
})

// ── task 1.2 ──────────────────────────────────────────────────────────────
describe("createOrgDocument (document-library task 1.2)", () => {
  it("creates an item: category / title / url + created_by + timestamps", async () => {
    const r = await createOrgDocument(staff, base)

    expect(r.id).toMatch(/^orgDocuments-/)
    expect(docSet).toHaveBeenCalledTimes(1)
    const [data] = docSet.mock.calls[0]
    expect(data).toMatchObject({
      category: "meeting_minutes",
      title: "Họp kế hoạch tháng 9",
      url: "https://docs.google.com/document/d/x/edit",
      doc_date: null,
      note: null,
      created_by: "u-staff",
      updated_by: "u-staff",
    })
    expect(data.created_at).toBeDefined()
    expect(data.updated_at).toBeDefined()
  })

  it("stores an optional doc_date and note; trims the title", async () => {
    await createOrgDocument(staff, {
      ...base,
      title: "  Họp tuần  ",
      doc_date: "2026-09-01",
      note: "chốt ngân sách",
    })
    const [data] = docSet.mock.calls[0]
    expect(data).toMatchObject({
      title: "Họp tuần",
      doc_date: "2026-09-01",
      note: "chốt ngân sách",
    })
  })

  it("rejects a missing title with 400", async () => {
    await expect(
      createOrgDocument(staff, { ...base, title: "" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      createOrgDocument(staff, { ...base, title: "   " })
    ).rejects.toThrow(/title|tiêu đề/i)
    expect(docSet).not.toHaveBeenCalled()
  })

  it("rejects a missing url with 400", async () => {
    await expect(
      createOrgDocument(staff, { category: "org_document", title: "x" })
    ).rejects.toMatchObject({ status: 400 })
    expect(docSet).not.toHaveBeenCalled()
  })

  it("rejects a url without an http(s) scheme (light check, no network)", async () => {
    await expect(
      createOrgDocument(staff, { ...base, url: "docs.google.com/x" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      createOrgDocument(staff, { ...base, url: "ftp://host/file" })
    ).rejects.toMatchObject({ status: 400 })
    expect(docSet).not.toHaveBeenCalled()
  })

  it("rejects a category outside the two libraries", async () => {
    await expect(
      createOrgDocument(staff, { ...base, category: "random" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects a doc_date that is not YYYY-MM-DD", async () => {
    await expect(
      createOrgDocument(staff, { ...base, doc_date: "01/09/2026" })
    ).rejects.toMatchObject({ status: 400 })
  })
})

// ── task 1.3 ──────────────────────────────────────────────────────────────
describe("updateOrgDocument / deleteOrgDocument (document-library task 1.3)", () => {
  beforeEach(() => {
    fx.docs = {
      d1: {
        category: "meeting_minutes",
        title: "Cũ",
        url: "https://x.com/a",
        doc_date: "2026-08-01",
        note: "cũ",
        created_by: "u-other",
        created_at: ts(1000),
        updated_at: ts(1000),
      },
    }
  })

  it("edits fields and stamps updated_by / updated_at", async () => {
    const r = await updateOrgDocument(staff, "d1", {
      title: "  Mới  ",
      url: "https://x.com/b",
    })
    expect(r).toEqual({ id: "d1" })
    const [patch] = docUpdate.mock.calls[0]
    expect(patch).toMatchObject({
      title: "Mới",
      url: "https://x.com/b",
      updated_by: "u-staff",
    })
    expect(patch.updated_at).toBeDefined()
  })

  it("clears doc_date / note to null", async () => {
    await updateOrgDocument(staff, "d1", { doc_date: null, note: null })
    const [patch] = docUpdate.mock.calls[0]
    expect(patch.doc_date).toBeNull()
    expect(patch.note).toBeNull()
  })

  it("rejects an empty body with 400", async () => {
    await expect(
      updateOrgDocument(staff, "d1", {})
    ).rejects.toMatchObject({ status: 400 })
    expect(docUpdate).not.toHaveBeenCalled()
  })

  it("rejects a bad url on edit", async () => {
    await expect(
      updateOrgDocument(staff, "d1", { url: "not-a-url" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("404 when the item does not exist (update / delete)", async () => {
    await expect(
      updateOrgDocument(staff, "nope", { title: "x" })
    ).rejects.toMatchObject({ status: 404 })
    await expect(deleteOrgDocument("nope")).rejects.toMatchObject({
      status: 404,
    })
  })

  it("deletes the item", async () => {
    const r = await deleteOrgDocument("d1")
    expect(r).toEqual({ id: "d1", deleted: true })
    expect(docDelete).toHaveBeenCalledTimes(1)
  })
})

// ── task 1.4 ──────────────────────────────────────────────────────────────
describe("listOrgDocuments (document-library task 1.4)", () => {
  beforeEach(() => {
    fx.docs = {
      a: { category: "meeting_minutes", title: "Họp tháng 9", url: "https://x/a", doc_date: "2026-09-10", created_at: ts(10), updated_at: ts(50) },
      b: { category: "meeting_minutes", title: "Họp tháng 8", url: "https://x/b", doc_date: "2026-08-05", created_at: ts(20), updated_at: ts(90) },
      c: { category: "meeting_minutes", title: "Ghi chú rời", url: "https://x/c", doc_date: null, created_at: ts(30), updated_at: ts(70) },
      z: { category: "org_document", title: "Quy chế lương", url: "https://x/z", doc_date: "2026-01-01", created_at: ts(1), updated_at: ts(1) },
    }
  })

  it("returns only the requested library", async () => {
    const r = await listOrgDocuments({ category: "org_document" })
    expect(r.items.map((d) => d.id)).toEqual(["z"])
  })

  it("sorts by doc_date desc by default, undated last", async () => {
    const r = await listOrgDocuments({ category: "meeting_minutes" })
    expect(r.items.map((d) => d.id)).toEqual(["a", "b", "c"])
  })

  it("sorts by updated_at desc when asked", async () => {
    const r = await listOrgDocuments({
      category: "meeting_minutes",
      sort: "updated_at",
    })
    expect(r.items.map((d) => d.id)).toEqual(["b", "c", "a"])
  })

  it("partial, case-insensitive title search", async () => {
    const r = await listOrgDocuments({
      category: "meeting_minutes",
      q: "tháng 9",
    })
    expect(r.items.map((d) => d.id)).toEqual(["a"])
  })

  it("an unknown sort value falls back to doc_date (no 400)", async () => {
    const r = await listOrgDocuments({
      category: "meeting_minutes",
      sort: "banana",
    })
    expect(r.items.map((d) => d.id)).toEqual(["a", "b", "c"])
  })

  it("400 when category is missing / invalid", async () => {
    await expect(listOrgDocuments({})).rejects.toMatchObject({ status: 400 })
    await expect(
      listOrgDocuments({ category: "nope" })
    ).rejects.toMatchObject({ status: 400 })
  })
})

// ── task 3.2 — no role gate ───────────────────────────────────────────────
// Auth (a signed-in user) is enforced by `getAuthedUser` in the route handlers
// — a caller that reaches these functions is authenticated; an unauthenticated
// request never gets here (401). Below the auth line there is NO role check:
// staff and manager do exactly the same thing.
describe("every signed-in member can CRUD (document-library task 3.2)", () => {
  beforeEach(() => {
    fx.docs = {
      d1: {
        category: "org_document",
        title: "Quy chế",
        url: "https://x/q",
        created_by: "someone-else",
        created_at: ts(1),
        updated_at: ts(1),
      },
    }
  })

  it("a staff member can add, edit and delete", async () => {
    const { id } = await createOrgDocument(staff, {
      category: "org_document",
      title: "Của nhân sự",
      url: "https://x/s",
    })
    expect(id).toBeTruthy()
    await expect(
      updateOrgDocument(staff, "d1", { title: "Sửa bởi nhân sự" })
    ).resolves.toEqual({ id: "d1" })
    await expect(deleteOrgDocument("d1")).resolves.toEqual({
      id: "d1",
      deleted: true,
    })
  })

  it("a manager does exactly the same — no extra privilege, no restriction", async () => {
    await expect(
      createOrgDocument(manager, {
        category: "meeting_minutes",
        title: "Của trưởng phòng",
        url: "https://x/m",
      })
    ).resolves.toMatchObject({ id: expect.any(String) })
    await expect(
      updateOrgDocument(manager, "d1", { note: "ghi chú" })
    ).resolves.toEqual({ id: "d1" })
  })

  it("a member can edit / delete an item someone else created", async () => {
    // d1.created_by = "someone-else"; staff still edits and deletes it
    await updateOrgDocument(staff, "d1", { title: "x" })
    expect(docUpdate.mock.calls[0][0]).toMatchObject({ updated_by: "u-staff" })
    await expect(deleteOrgDocument("d1")).resolves.toMatchObject({
      deleted: true,
    })
  })
})
