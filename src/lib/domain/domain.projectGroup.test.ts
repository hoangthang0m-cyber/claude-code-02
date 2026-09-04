import { describe, expect, it } from "vitest"

import {
  COLLECTIONS,
  PROJECT_GROUP_LIFECYCLES,
  PROJECT_GROUP_LIFECYCLE_LABELS,
  SORT_INDEX_STEP,
  computeSortIndexBackfill,
  isProjectGroupWritable,
  nextSortIndex,
  projectCreateSchema,
  projectGroupAssignmentSchema,
  projectGroupCreateSchema,
  projectGroupId,
  projectGroupLifecycleSchema,
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

  it("marks only an archived group read-only (task 2.2 / 2.3)", () => {
    expect(isProjectGroupWritable("active")).toBe(true)
    expect(isProjectGroupWritable("archived")).toBe(false)
    expect(isProjectGroupWritable(undefined)).toBe(true)
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

describe("projectGroupLifecycleSchema (task 2.3)", () => {
  it("accepts active and archived", () => {
    expect(projectGroupLifecycleSchema.safeParse({ lifecycle: "active" }).success).toBe(true)
    expect(projectGroupLifecycleSchema.safeParse({ lifecycle: "archived" }).success).toBe(true)
  })

  it("rejects any other value (no 'done' like Project)", () => {
    expect(projectGroupLifecycleSchema.safeParse({ lifecycle: "done" }).success).toBe(false)
    expect(projectGroupLifecycleSchema.safeParse({}).success).toBe(false)
  })
})

describe("projectGroupAssignmentSchema (task 3.1)", () => {
  it("accepts a group id and accepts null (clear)", () => {
    expect(
      projectGroupAssignmentSchema.safeParse({ group_id: "grp_ugc" }).success
    ).toBe(true)
    expect(
      projectGroupAssignmentSchema.safeParse({ group_id: null }).success
    ).toBe(true)
  })

  it("rejects a missing field, a blank string, or a non-string", () => {
    expect(projectGroupAssignmentSchema.safeParse({}).success).toBe(false)
    expect(
      projectGroupAssignmentSchema.safeParse({ group_id: "  " }).success
    ).toBe(false)
    expect(
      projectGroupAssignmentSchema.safeParse({ group_id: 7 }).success
    ).toBe(false)
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

// task 1.3 — Project.sort_index backfill.
describe("computeSortIndexBackfill (task 1.3)", () => {
  it("assigns 100, 200, 300… in created_at order within the ungrouped bucket", () => {
    const r = computeSortIndexBackfill([
      { id: "c", created_ms: 300 },
      { id: "a", created_ms: 100 },
      { id: "b", created_ms: 200 },
    ])
    expect(r.get("a")).toBe(100)
    expect(r.get("b")).toBe(200)
    expect(r.get("c")).toBe(300)
  })

  it("breaks a created_at tie by id, deterministically", () => {
    const r = computeSortIndexBackfill([
      { id: "z", created_ms: 500 },
      { id: "y", created_ms: 500 },
    ])
    expect(r.get("y")).toBe(100)
    expect(r.get("z")).toBe(200)
  })

  it("indexes each bucket independently — unique within a bucket", () => {
    const r = computeSortIndexBackfill([
      { id: "p1", group_id: "g1", created_ms: 10 },
      { id: "p2", group_id: "g1", created_ms: 20 },
      { id: "p3", group_id: "g2", created_ms: 5 },
      { id: "p4", created_ms: 1 },
    ])
    // per-bucket values, each starting at the step
    expect([r.get("p1"), r.get("p2")]).toEqual([100, 200])
    expect(r.get("p3")).toBe(100)
    expect(r.get("p4")).toBe(100)

    // the explicit task check: sort_index is unique inside every bucket
    for (const bucket of [
      ["p1", "p2"],
      ["p3"],
      ["p4"],
    ]) {
      const values = bucket.map((id) => r.get(id))
      expect(new Set(values).size).toBe(values.length)
    }
  })

  it("appends un-indexed projects after the bucket's current max (idempotent)", () => {
    const r = computeSortIndexBackfill([
      { id: "old1", created_ms: 1, sort_index: 100 },
      { id: "old2", created_ms: 2, sort_index: 250 },
      { id: "new1", created_ms: 3 },
      { id: "new2", created_ms: 4 },
    ])
    expect(r.has("old1")).toBe(false)
    expect(r.has("old2")).toBe(false)
    expect(r.get("new1")).toBe(250 + SORT_INDEX_STEP)
    expect(r.get("new2")).toBe(250 + 2 * SORT_INDEX_STEP)
  })

  it("does nothing when every project already has a sort_index", () => {
    const r = computeSortIndexBackfill([
      { id: "a", created_ms: 1, sort_index: 100 },
      { id: "b", created_ms: 2, sort_index: 200 },
    ])
    expect(r.size).toBe(0)
  })
})

describe("nextSortIndex (task 3.2)", () => {
  it("first into an empty bucket → the first step", () => {
    expect(nextSortIndex([])).toBe(SORT_INDEX_STEP)
  })

  it("otherwise → one step past the bucket's max, order-independent", () => {
    expect(nextSortIndex([100, 300, 200])).toBe(400)
    expect(nextSortIndex([250])).toBe(350)
  })
})
