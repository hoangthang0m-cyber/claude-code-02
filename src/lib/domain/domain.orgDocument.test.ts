import { describe, expect, it } from "vitest"

import {
  COLLECTIONS,
  ORG_DOCUMENT_CATEGORIES,
  ORG_DOCUMENT_CATEGORY_LABELS,
  filterAndSortOrgDocuments,
  orgDocumentCreateSchema,
  orgDocumentListQuerySchema,
  orgDocumentUpdateSchema,
  type OrgDocumentView,
} from "@/lib/domain"

// document-library task 1.1 — Firestore is schemaless, so these Zod schemas +
// firestore.rules ARE the "migration". "Up/down clean" = every schema accepts a
// valid body and rejects a bad category / missing required field / bad URL.

describe("OrgDocument: registry & category wiring", () => {
  it("registers the orgDocuments collection", () => {
    expect(COLLECTIONS.orgDocuments).toBe("orgDocuments")
  })

  it("has exactly the two library categories with labels", () => {
    expect(ORG_DOCUMENT_CATEGORIES).toEqual(["meeting_minutes", "org_document"])
    expect(Object.keys(ORG_DOCUMENT_CATEGORY_LABELS)).toEqual([
      "meeting_minutes",
      "org_document",
    ])
  })
})

describe("orgDocumentCreateSchema", () => {
  const ok = {
    category: "meeting_minutes" as const,
    title: "Họp kế hoạch tháng 9",
    url: "https://docs.google.com/document/d/x/edit",
  }

  it("accepts category + title + url", () => {
    expect(orgDocumentCreateSchema.safeParse(ok).success).toBe(true)
  })

  it("accepts an optional doc_date and note; trims title", () => {
    const r = orgDocumentCreateSchema.safeParse({
      ...ok,
      title: "  Họp tuần  ",
      doc_date: "2026-09-01",
      note: "chốt ngân sách",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.title).toBe("Họp tuần")
  })

  it("rejects a missing title or url — naming the field", () => {
    expect(orgDocumentCreateSchema.safeParse({ ...ok, title: "" }).success).toBe(
      false
    )
    expect(
      orgDocumentCreateSchema.safeParse({ ...ok, title: "   " }).success
    ).toBe(false)
    const noUrl = orgDocumentCreateSchema.safeParse({
      category: "org_document",
      title: "x",
    })
    expect(noUrl.success).toBe(false)
  })

  it("rejects a category outside the two libraries", () => {
    expect(
      orgDocumentCreateSchema.safeParse({ ...ok, category: "random" }).success
    ).toBe(false)
  })

  it("rejects a URL without an http(s) scheme (light check only)", () => {
    expect(
      orgDocumentCreateSchema.safeParse({ ...ok, url: "docs.google.com/x" })
        .success
    ).toBe(false)
    expect(
      orgDocumentCreateSchema.safeParse({ ...ok, url: "ftp://x/y" }).success
    ).toBe(false)
  })

  it("rejects a doc_date that is not YYYY-MM-DD", () => {
    expect(
      orgDocumentCreateSchema.safeParse({ ...ok, doc_date: "01/09/2026" })
        .success
    ).toBe(false)
  })

  it("strips server-owned fields (created_by / created_at / id)", () => {
    const r = orgDocumentCreateSchema.safeParse({
      ...ok,
      id: "x",
      created_by: "u1",
      created_at: 123,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect("id" in r.data).toBe(false)
      expect("created_by" in r.data).toBe(false)
      expect("created_at" in r.data).toBe(false)
    }
  })
})

describe("orgDocumentUpdateSchema", () => {
  it("accepts a single-field edit", () => {
    expect(
      orgDocumentUpdateSchema.safeParse({ title: "Tên mới" }).success
    ).toBe(true)
    expect(
      orgDocumentUpdateSchema.safeParse({ url: "https://x.com/y" }).success
    ).toBe(true)
  })

  it("accepts clearing doc_date / note to null", () => {
    expect(
      orgDocumentUpdateSchema.safeParse({ doc_date: null, note: null }).success
    ).toBe(true)
  })

  it("accepts an empty body (no-op)", () => {
    expect(orgDocumentUpdateSchema.safeParse({}).success).toBe(true)
  })

  it("does not carry category — an item stays in its library", () => {
    const r = orgDocumentUpdateSchema.safeParse({
      title: "x",
      category: "org_document",
    })
    expect(r.success).toBe(true)
    if (r.success) expect("category" in r.data).toBe(false)
  })

  it("still rejects a blank title or a bad url on edit", () => {
    expect(orgDocumentUpdateSchema.safeParse({ title: "  " }).success).toBe(false)
    expect(
      orgDocumentUpdateSchema.safeParse({ url: "not-a-url" }).success
    ).toBe(false)
  })
})

// document-library task 1.4 — list query + pure filter/sort.
const view = (
  id: string,
  over: Partial<OrgDocumentView> = {}
): OrgDocumentView => ({
  id,
  category: "meeting_minutes",
  title: id,
  url: `https://x/${id}`,
  doc_date: null,
  note: null,
  created_by: "u",
  created_at: 0,
  updated_by: null,
  updated_at: 0,
  ...over,
})

describe("orgDocumentListQuerySchema", () => {
  it("requires a category", () => {
    expect(orgDocumentListQuerySchema.safeParse({}).success).toBe(false)
  })

  it("defaults sort to doc_date and coerces an unknown sort", () => {
    const a = orgDocumentListQuerySchema.parse({ category: "org_document" })
    expect(a.sort).toBe("doc_date")
    const b = orgDocumentListQuerySchema.parse({
      category: "org_document",
      sort: "banana",
    })
    expect(b.sort).toBe("doc_date")
  })
})

describe("filterAndSortOrgDocuments", () => {
  const rows = [
    view("a", { title: "Họp tháng 9", doc_date: "2026-09-10", updated_at: 50 }),
    view("b", { title: "Họp tháng 8", doc_date: "2026-08-05", updated_at: 90 }),
    view("c", { title: "Ghi chú rời", doc_date: null, updated_at: 70 }),
  ]

  it("doc_date desc, undated last", () => {
    expect(
      filterAndSortOrgDocuments(rows, { sort: "doc_date" }).map((d) => d.id)
    ).toEqual(["a", "b", "c"])
  })

  it("updated_at desc", () => {
    expect(
      filterAndSortOrgDocuments(rows, { sort: "updated_at" }).map((d) => d.id)
    ).toEqual(["b", "c", "a"])
  })

  it("partial, case-insensitive title match", () => {
    expect(
      filterAndSortOrgDocuments(rows, { q: "THÁNG 9", sort: "doc_date" }).map(
        (d) => d.id
      )
    ).toEqual(["a"])
  })

  it("does not mutate the input array", () => {
    const input = [...rows]
    filterAndSortOrgDocuments(input, { sort: "updated_at" })
    expect(input.map((d) => d.id)).toEqual(["a", "b", "c"])
  })

  it("ties on doc_date break by most-recently-updated", () => {
    const tied = [
      view("x", { doc_date: "2026-09-01", updated_at: 10 }),
      view("y", { doc_date: "2026-09-01", updated_at: 99 }),
    ]
    expect(
      filterAndSortOrgDocuments(tied, { sort: "doc_date" }).map((d) => d.id)
    ).toEqual(["y", "x"])
  })
})
