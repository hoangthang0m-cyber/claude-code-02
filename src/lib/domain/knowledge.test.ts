import { describe, expect, it } from "vitest"

import {
  COLLECTIONS,
  KNOWLEDGE_LIFECYCLES,
  KNOWLEDGE_LIFECYCLE_LABELS,
  KNOWLEDGE_LINK_SECTIONS,
  KNOWLEDGE_LINK_SECTION_LABELS,
  KNOWLEDGE_PROJECT_REF_TYPES,
  KNOWLEDGE_PROJECT_REF_TYPE_LABELS,
  isKnowledgeEntryWritable,
  knowledgeEntryCreateSchema,
  knowledgeEntryDeleteSchema,
  knowledgeEntryLifecycleSchema,
  knowledgeEntryUpdateSchema,
  knowledgeLinkCreateSchema,
  knowledgeLinkReorderSchema,
  knowledgeLinkUpdateSchema,
  knowledgeProjectRefCreateSchema,
  knowledgeRefHref,
} from "@/lib/domain"

// knowledge-base task 1.1 / 1.2 / 1.3 — Firestore is schemaless, so these Zod
// schemas + firestore.rules ARE the migration. "Up/down clean" = each schema
// accepts a valid body and rejects a bad enum / missing required field / bad URL.

describe("knowledge-base: registry & enum wiring", () => {
  it("registers the three collections", () => {
    expect(COLLECTIONS.knowledgeEntries).toBe("knowledgeEntries")
    expect(COLLECTIONS.knowledgeLinks).toBe("knowledgeLinks")
    expect(COLLECTIONS.knowledgeProjectRefs).toBe("knowledgeProjectRefs")
  })

  it("has active | archived lifecycle (no 'done')", () => {
    expect(KNOWLEDGE_LIFECYCLES).toEqual(["active", "archived"])
    expect(Object.keys(KNOWLEDGE_LIFECYCLE_LABELS)).toEqual([
      "active",
      "archived",
    ])
  })

  it("has the three link sections in order (đầu mục 3 / 4 / 5)", () => {
    expect(KNOWLEDGE_LINK_SECTIONS).toEqual(["detail", "process", "conclusion"])
    expect(Object.keys(KNOWLEDGE_LINK_SECTION_LABELS)).toEqual([
      "detail",
      "process",
      "conclusion",
    ])
  })

  it("has project | project_group ref types", () => {
    expect(KNOWLEDGE_PROJECT_REF_TYPES).toEqual(["project", "project_group"])
    expect(Object.keys(KNOWLEDGE_PROJECT_REF_TYPE_LABELS)).toEqual([
      "project",
      "project_group",
    ])
  })

  it("marks only an archived entry read-only", () => {
    expect(isKnowledgeEntryWritable("active")).toBe(true)
    expect(isKnowledgeEntryWritable("archived")).toBe(false)
    expect(isKnowledgeEntryWritable(undefined)).toBe(true)
  })

  it("knowledgeRefHref points at the right /campaigns path", () => {
    expect(knowledgeRefHref({ ref_type: "project", ref_id: "p1" })).toBe(
      "/campaigns/p1"
    )
    expect(
      knowledgeRefHref({ ref_type: "project_group", ref_id: "g1" })
    ).toBe("/campaigns/groups/g1")
  })
})

describe("knowledgeEntryCreateSchema", () => {
  const ok = { name: "Cách viết content ra đơn", overview: "Áp dụng cho reels bán hàng" }

  it("accepts name + overview", () => {
    expect(knowledgeEntryCreateSchema.safeParse(ok).success).toBe(true)
  })

  it("accepts the optional section notes; trims name", () => {
    const r = knowledgeEntryCreateSchema.safeParse({
      ...ok,
      name: "  Tên  ",
      detail_note: "chi tiết",
      process_note: "quá trình",
      conclusion_note: "đúc kết",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe("Tên")
  })

  it("rejects a missing name or overview", () => {
    expect(
      knowledgeEntryCreateSchema.safeParse({ overview: "x" }).success
    ).toBe(false)
    expect(
      knowledgeEntryCreateSchema.safeParse({ name: "x" }).success
    ).toBe(false)
    expect(
      knowledgeEntryCreateSchema.safeParse({ name: "  ", overview: "x" }).success
    ).toBe(false)
  })

  it("strips server-owned fields (lifecycle / created_by / id)", () => {
    const r = knowledgeEntryCreateSchema.safeParse({
      ...ok,
      lifecycle: "archived",
      created_by: "u1",
      id: "x",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toEqual({
        name: ok.name,
        overview: ok.overview,
      })
    }
  })
})

describe("knowledgeEntryUpdateSchema", () => {
  it("accepts a single-field edit and an empty body", () => {
    expect(knowledgeEntryUpdateSchema.safeParse({ name: "Mới" }).success).toBe(
      true
    )
    expect(knowledgeEntryUpdateSchema.safeParse({}).success).toBe(true)
  })

  it("accepts clearing a section note to null", () => {
    expect(
      knowledgeEntryUpdateSchema.safeParse({ process_note: null }).success
    ).toBe(true)
  })

  it("rejects blanking name / overview", () => {
    expect(knowledgeEntryUpdateSchema.safeParse({ name: "  " }).success).toBe(
      false
    )
    expect(
      knowledgeEntryUpdateSchema.safeParse({ overview: "" }).success
    ).toBe(false)
  })

  it("does not carry lifecycle", () => {
    const r = knowledgeEntryUpdateSchema.safeParse({
      name: "x",
      lifecycle: "archived",
    })
    expect(r.success).toBe(true)
    if (r.success) expect("lifecycle" in r.data).toBe(false)
  })
})

describe("knowledgeEntryLifecycleSchema / knowledgeEntryDeleteSchema", () => {
  it("lifecycle accepts active | archived only", () => {
    expect(
      knowledgeEntryLifecycleSchema.safeParse({ lifecycle: "active" }).success
    ).toBe(true)
    expect(
      knowledgeEntryLifecycleSchema.safeParse({ lifecycle: "done" }).success
    ).toBe(false)
  })

  it("delete requires a non-empty confirm_name", () => {
    expect(
      knowledgeEntryDeleteSchema.safeParse({ confirm_name: "Tên" }).success
    ).toBe(true)
    expect(
      knowledgeEntryDeleteSchema.safeParse({ confirm_name: "  " }).success
    ).toBe(false)
  })
})

describe("knowledgeLink schemas", () => {
  const ok = {
    section: "detail" as const,
    url: "https://docs.google.com/spreadsheets/d/x",
    label: "Bảng số liệu gốc",
  }

  it("create accepts a valid link with a section", () => {
    expect(knowledgeLinkCreateSchema.safeParse(ok).success).toBe(true)
  })

  it("create rejects a missing label", () => {
    expect(
      knowledgeLinkCreateSchema.safeParse({ ...ok, label: "" }).success
    ).toBe(false)
  })

  it("create rejects a section outside detail | process | conclusion", () => {
    expect(
      knowledgeLinkCreateSchema.safeParse({ ...ok, section: "name" }).success
    ).toBe(false)
  })

  it("create rejects a URL without an http(s) scheme", () => {
    expect(
      knowledgeLinkCreateSchema.safeParse({ ...ok, url: "ftp://host/f" })
        .success
    ).toBe(false)
    expect(
      knowledgeLinkCreateSchema.safeParse({ ...ok, url: "docs.google.com/x" })
        .success
    ).toBe(false)
  })

  it("update accepts partial fields; reorder needs section + ids", () => {
    expect(
      knowledgeLinkUpdateSchema.safeParse({ label: "Nhãn mới" }).success
    ).toBe(true)
    expect(
      knowledgeLinkReorderSchema.safeParse({
        section: "process",
        ordered_ids: ["a", "b"],
      }).success
    ).toBe(true)
    expect(
      knowledgeLinkReorderSchema.safeParse({
        section: "process",
        ordered_ids: [],
      }).success
    ).toBe(false)
  })
})

describe("knowledgeProjectRefCreateSchema", () => {
  it("accepts a project / project_group ref by id", () => {
    expect(
      knowledgeProjectRefCreateSchema.safeParse({
        ref_type: "project",
        ref_id: "p1",
      }).success
    ).toBe(true)
    expect(
      knowledgeProjectRefCreateSchema.safeParse({
        ref_type: "project_group",
        ref_id: "g1",
        note: "nhóm liên quan",
      }).success
    ).toBe(true)
  })

  it("rejects a bad ref_type or a missing ref_id", () => {
    expect(
      knowledgeProjectRefCreateSchema.safeParse({
        ref_type: "content_item",
        ref_id: "x",
      }).success
    ).toBe(false)
    expect(
      knowledgeProjectRefCreateSchema.safeParse({ ref_type: "project" }).success
    ).toBe(false)
  })

  it("does not carry ref_name — the server snapshots it", () => {
    const r = knowledgeProjectRefCreateSchema.safeParse({
      ref_type: "project",
      ref_id: "p1",
      ref_name: "Tên bịa",
    })
    expect(r.success).toBe(true)
    if (r.success) expect("ref_name" in r.data).toBe(false)
  })
})
