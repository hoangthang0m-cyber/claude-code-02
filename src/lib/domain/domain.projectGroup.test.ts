import { describe, expect, it } from "vitest"

import {
  COLLECTIONS,
  PROJECT_GROUP_LIFECYCLES,
  PROJECT_GROUP_LIFECYCLE_LABELS,
  projectCreateSchema,
  projectGroupCreateSchema,
  projectGroupId,
  projectGroupUpdateSchema,
} from "@/lib/domain"

// project-grouping change task 1.1 — "migration" for the ProjectGroup table.
// Firestore is schemaless: these Zod schemas + firestore.rules ARE the schema.
// "Verify migration up/down clean" = every schema accepts a valid body and
// rejects a bad enum / missing required field, same check as SPEC §7.1 task 1.2.

describe("ProjectGroup: registry & enum wiring", () => {
  it("registers the projectGroups collection", () => {
    expect(COLLECTIONS.projectGroups).toBe("projectGroups")
  })

  it("has exactly the active | archived lifecycle (no 'done')", () => {
    expect(PROJECT_GROUP_LIFECYCLES).toEqual(["active", "archived"])
    expect(Object.keys(PROJECT_GROUP_LIFECYCLE_LABELS)).toEqual([
      "active",
      "archived",
    ])
  })
})

describe("projectGroupCreateSchema", () => {
  it("accepts a name only", () => {
    expect(
      projectGroupCreateSchema.safeParse({ name: "UGC ROAS 2.0" }).success
    ).toBe(true)
  })

  it("accepts an optional description", () => {
    const r = projectGroupCreateSchema.safeParse({
      name: "UGC ROAS 2.0",
      description: "Các đợt UGC cùng định hướng",
    })
    expect(r.success).toBe(true)
  })

  it("rejects a missing name", () => {
    expect(projectGroupCreateSchema.safeParse({}).success).toBe(false)
  })

  it("rejects an empty / whitespace name", () => {
    expect(projectGroupCreateSchema.safeParse({ name: "   " }).success).toBe(
      false
    )
  })

  it("trims the name", () => {
    const r = projectGroupCreateSchema.safeParse({ name: "  Nhóm A  " })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe("Nhóm A")
  })

  it("does not carry the Project form fields", () => {
    const r = projectGroupCreateSchema.safeParse({
      name: "Nhóm A",
      objective: "x",
      scale: "y",
      progress_sheet_url: "z",
      retrospective: "w",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toEqual({ name: "Nhóm A" })
    }
  })
})

describe("projectGroupUpdateSchema", () => {
  it("accepts a name-only edit", () => {
    expect(
      projectGroupUpdateSchema.safeParse({ name: "Tên mới" }).success
    ).toBe(true)
  })

  it("accepts a description-only edit", () => {
    expect(
      projectGroupUpdateSchema.safeParse({ description: "mô tả mới" }).success
    ).toBe(true)
  })

  it("accepts an empty body (no-op edit)", () => {
    expect(projectGroupUpdateSchema.safeParse({}).success).toBe(true)
  })

  it("strips lifecycle — archive / restore has its own path", () => {
    const r = projectGroupUpdateSchema.safeParse({
      name: "Tên mới",
      lifecycle: "archived",
    })
    expect(r.success).toBe(true)
    if (r.success) expect("lifecycle" in r.data).toBe(false)
  })
})

// task 1.2 — Project.group_id: the "column" is a nullable link, no backfill.
describe("Project.group_id (task 1.2)", () => {
  it("a project doc written before this change reads back as ungrouped", () => {
    // legacy doc: the field simply isn't there
    expect(projectGroupId({})).toBeNull()
    expect(projectGroupId({ group_id: undefined })).toBeNull()
  })

  it("an explicit null is also ungrouped", () => {
    expect(projectGroupId({ group_id: null })).toBeNull()
  })

  it("returns the group id when set", () => {
    expect(projectGroupId({ group_id: "grp_ugc" })).toBe("grp_ugc")
  })

  it("is not a create-form field — projectCreateSchema strips group_id", () => {
    const r = projectCreateSchema.safeParse({
      name: "P",
      objective: "o",
      group_id: "grp_ugc",
    })
    expect(r.success).toBe(true)
    if (r.success) expect("group_id" in r.data).toBe(false)
  })
})
