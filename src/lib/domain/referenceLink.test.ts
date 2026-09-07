import { describe, expect, it } from "vitest"

import {
  nextReferenceLinkSortIndex,
  referenceLinkCreateSchema,
  referenceLinkReorderSchema,
  referenceLinkUpdateSchema,
  reorderReferenceLinks,
} from "@/lib/domain/referenceLink"

describe("referenceLinkCreateSchema (task 2.1 / 3.1)", () => {
  it("accepts a project link with a label", () => {
    const r = referenceLinkCreateSchema.safeParse({
      owner_type: "project",
      owner_id: "p1",
      url: "https://docs.google.com/spreadsheets/d/x/edit",
      label: "Timeline chi tiết",
    })
    expect(r.success).toBe(true)
  })

  it("accepts any http(s) URL — Sheets / Docs / Drive / arbitrary", () => {
    for (const url of [
      "https://docs.google.com/document/d/x/edit",
      "https://drive.google.com/file/d/x/view",
      "http://example.com/whatever?a=1",
    ]) {
      expect(
        referenceLinkCreateSchema.safeParse({
          owner_type: "content_item",
          owner_id: "ci1",
          url,
          label: "x",
        }).success
      ).toBe(true)
    }
  })

  it("rejects a missing label", () => {
    expect(
      referenceLinkCreateSchema.safeParse({
        owner_type: "project",
        owner_id: "p1",
        url: "https://x.com",
      }).success
    ).toBe(false)
  })

  it("rejects a blank label", () => {
    expect(
      referenceLinkCreateSchema.safeParse({
        owner_type: "project",
        owner_id: "p1",
        url: "https://x.com",
        label: "   ",
      }).success
    ).toBe(false)
  })

  it("rejects a non-http URL", () => {
    expect(
      referenceLinkCreateSchema.safeParse({
        owner_type: "project",
        owner_id: "p1",
        url: "not a url",
        label: "x",
      }).success
    ).toBe(false)
  })

  it("rejects an owner_type outside the enum", () => {
    expect(
      referenceLinkCreateSchema.safeParse({
        owner_type: "campaign",
        owner_id: "p1",
        url: "https://x.com",
        label: "x",
      }).success
    ).toBe(false)
  })
})

describe("referenceLinkUpdateSchema", () => {
  it("allows a partial edit and setting note to null", () => {
    const r = referenceLinkUpdateSchema.safeParse({ label: "Đổi nhãn", note: null })
    expect(r.success).toBe(true)
  })
})

describe("sort_index helpers (task 3.3)", () => {
  it("appends after the current max, gapped by 100", () => {
    expect(nextReferenceLinkSortIndex([])).toBe(100)
    expect(nextReferenceLinkSortIndex([100, 300, 200])).toBe(400)
  })

  it("reorder maps an id list to 100, 200, 300…", () => {
    expect([...reorderReferenceLinks(["c", "a", "b"]).entries()]).toEqual([
      ["c", 100],
      ["a", 200],
      ["b", 300],
    ])
  })

  it("reorder schema needs a non-empty id list + owner", () => {
    expect(
      referenceLinkReorderSchema.safeParse({
        owner_type: "project",
        owner_id: "p1",
        ordered_ids: [],
      }).success
    ).toBe(false)
  })
})
