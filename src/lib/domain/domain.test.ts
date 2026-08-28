import { describe, expect, it } from "vitest"

import {
  CONTENT_ITEM_INITIAL_STATUS,
  CONTENT_STATUSES,
  COLLECTIONS,
  canChangeLifecycle,
  commentWriteSchema,
  contentItemCreateSchema,
  contentFieldUpdateSchema,
  contentListFiltersSchema,
  isBackgroundSyncActive,
  isOverdue,
  isProjectWritable,
  projectCreateSchema,
  projectMemberAddSchema,
  projectMemberUpdateSchema,
  statusHistoryWriteSchema,
  userWriteSchema,
} from "@/lib/domain"

// Firestore is schemaless — there are no SQL migrations. These Zod schemas plus
// firestore.rules ARE the schema. "Migration up/down clean" (SPEC §7.1 task 1.2)
// is verified here: every schema accepts a valid document body and rejects a
// bad enum value or a missing required field, consistently.

describe("domain: enum wiring (SPEC §5.3 / §6.1)", () => {
  it("has the 7 production statuses in order", () => {
    expect(CONTENT_STATUSES).toEqual([
      "chua_bat_dau",
      "viet_kich_ban",
      "cho_duyet_kich_ban",
      "quay_dung",
      "cho_duyet_video",
      "da_duyet",
      "da_len_ads",
    ])
    expect(CONTENT_ITEM_INITIAL_STATUS).toBe("chua_bat_dau")
  })

  it("has the 6 foundation collection ids (§6.1)", () => {
    expect(COLLECTIONS).toMatchObject({
      users: "users",
      projects: "projects",
      projectMembers: "projectMembers",
      contentItems: "contentItems",
      statusHistory: "statusHistory",
      comments: "comments",
    })
  })
})

describe("userWriteSchema", () => {
  it("accepts a valid user", () => {
    expect(
      userWriteSchema.safeParse({
        name: "Thắng",
        email: "thang@hemtarot.vn",
        system_role: "manager",
      }).success
    ).toBe(true)
  })

  it("rejects a system_role outside the enum", () => {
    expect(
      userWriteSchema.safeParse({
        name: "Thắng",
        email: "thang@hemtarot.vn",
        system_role: "admin",
      }).success
    ).toBe(false)
  })

  it("rejects a missing required field", () => {
    expect(
      userWriteSchema.safeParse({ name: "Thắng", system_role: "staff" }).success
    ).toBe(false)
  })
})

describe("project lifecycle (SPEC §5.1 R3)", () => {
  it("allows running→done, running→archived, done→archived, and restores", () => {
    expect(canChangeLifecycle("running", "done")).toBe(true)
    expect(canChangeLifecycle("running", "archived")).toBe(true)
    expect(canChangeLifecycle("done", "archived")).toBe(true)
    expect(canChangeLifecycle("done", "running")).toBe(true)
    expect(canChangeLifecycle("archived", "running")).toBe(true)
  })

  it("blocks archived→done and any same-state move", () => {
    expect(canChangeLifecycle("archived", "done")).toBe(false)
    expect(canChangeLifecycle("running", "running")).toBe(false)
    expect(canChangeLifecycle("archived", "archived")).toBe(false)
  })

  it("marks only an archived project read-only", () => {
    expect(isProjectWritable("running")).toBe(true)
    expect(isProjectWritable("done")).toBe(true)
    expect(isProjectWritable("archived")).toBe(false)
  })

  it("runs background sync only for a running project (Q5 pending for done)", () => {
    expect(isBackgroundSyncActive("running")).toBe(true)
    expect(isBackgroundSyncActive("done")).toBe(false)
    expect(isBackgroundSyncActive("archived")).toBe(false)
  })
})

describe("projectCreateSchema (SPEC §5.1 R1)", () => {
  it("accepts name + objective only", () => {
    expect(
      projectCreateSchema.safeParse({ name: "Q3 Launch", objective: "Tăng Mess" })
        .success
    ).toBe(true)
  })

  it("rejects a missing objective", () => {
    const r = projectCreateSchema.safeParse({ name: "Q3 Launch" })
    expect(r.success).toBe(false)
  })

  it("rejects an empty name", () => {
    expect(
      projectCreateSchema.safeParse({ name: "  ", objective: "x" }).success
    ).toBe(false)
  })

  it("keeps a non-Sheets progress_sheet_url (stored, flagged downstream)", () => {
    expect(
      projectCreateSchema.safeParse({
        name: "P",
        objective: "o",
        progress_sheet_url: "not-a-real-url",
      }).success
    ).toBe(true)
  })
})

describe("projectMemberAddSchema (SPEC §5.1 R4)", () => {
  it("accepts a member with a skill tag", () => {
    expect(
      projectMemberAddSchema.safeParse({
        user_id: "u1",
        project_role: "staff",
        skill_tag: "content",
      }).success
    ).toBe(true)
  })

  it("defaults skill_tag to null when omitted", () => {
    const r = projectMemberAddSchema.safeParse({
      user_id: "u1",
      project_role: "manager",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.skill_tag).toBeNull()
  })

  it("rejects a project_role outside the enum", () => {
    expect(
      projectMemberAddSchema.safeParse({ user_id: "u1", project_role: "owner" })
        .success
    ).toBe(false)
  })
})

describe("projectMemberUpdateSchema", () => {
  it("accepts a role-only change", () => {
    expect(
      projectMemberUpdateSchema.safeParse({ project_role: "manager" }).success
    ).toBe(true)
  })

  it("accepts clearing the skill tag to null", () => {
    const r = projectMemberUpdateSchema.safeParse({ skill_tag: null })
    expect(r.success).toBe(true)
  })

  it("rejects a skill_tag outside the enum", () => {
    expect(
      projectMemberUpdateSchema.safeParse({ skill_tag: "design" }).success
    ).toBe(false)
  })
})

describe("contentItemCreateSchema (SPEC §5.2 R1)", () => {
  it("accepts just a code (project_id comes from the URL)", () => {
    expect(contentItemCreateSchema.safeParse({ code: "V001" }).success).toBe(true)
  })

  it("rejects a missing / empty code", () => {
    expect(contentItemCreateSchema.safeParse({}).success).toBe(false)
    expect(contentItemCreateSchema.safeParse({ code: "  " }).success).toBe(false)
  })
})

describe("contentFieldUpdateSchema (SPEC §5.2 R1)", () => {
  it("accepts a partial update of a single field", () => {
    expect(
      contentFieldUpdateSchema.safeParse({ topic: "Quay lại NYC" }).success
    ).toBe(true)
  })

  it("strips status / assignee_id / evaluation (handled by other endpoints)", () => {
    const r = contentFieldUpdateSchema.safeParse({
      topic: "x",
      status: "da_len_ads",
      assignee_id: "u1",
      evaluation: "note",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect("status" in r.data).toBe(false)
      expect("assignee_id" in r.data).toBe(false)
      expect("evaluation" in r.data).toBe(false)
    }
  })

  it("accepts a valid content_format", () => {
    expect(
      contentFieldUpdateSchema.safeParse({ content_format: "reels" }).success
    ).toBe(true)
  })

  it("rejects a content_format outside the enum", () => {
    expect(
      contentFieldUpdateSchema.safeParse({ content_format: "tiktok" }).success
    ).toBe(false)
  })

  it("rejects a malformed deadline", () => {
    expect(
      contentFieldUpdateSchema.safeParse({ deadline: "31/12/2026" }).success
    ).toBe(false)
  })

  it("accepts an ISO deadline and a null (clear) deadline", () => {
    expect(
      contentFieldUpdateSchema.safeParse({ deadline: "2026-09-01T00:00:00.000Z" })
        .success
    ).toBe(true)
    expect(contentFieldUpdateSchema.safeParse({ deadline: null }).success).toBe(
      true
    )
  })

})

describe("isOverdue (SPEC §3 / §6.7)", () => {
  const now = 1_000_000

  it("past deadline + not da_len_ads → overdue", () => {
    expect(isOverdue(now - 1, "quay_dung", now)).toBe(true)
  })

  it("past deadline but da_len_ads → not overdue", () => {
    expect(isOverdue(now - 1, "da_len_ads", now)).toBe(false)
  })

  it("future deadline → not overdue", () => {
    expect(isOverdue(now + 1, "quay_dung", now)).toBe(false)
  })

  it("no deadline → not overdue", () => {
    expect(isOverdue(null, "quay_dung", now)).toBe(false)
    expect(isOverdue(undefined, "chua_bat_dau", now)).toBe(false)
  })
})

describe("contentListFiltersSchema (SPEC §5.2 R4)", () => {
  it("defaults sort to updated_at and overdue to false", () => {
    const r = contentListFiltersSchema.parse({})
    expect(r.sort).toBe("updated_at")
    expect(r.overdue).toBe(false)
  })

  it("parses overdue=true and a valid status", () => {
    const r = contentListFiltersSchema.parse({
      overdue: "true",
      status: "cho_duyet_video",
      assignee: "u1",
    })
    expect(r).toMatchObject({
      overdue: true,
      status: "cho_duyet_video",
      assignee: "u1",
    })
  })

  it("falls back on an unknown status / sort rather than throwing", () => {
    const r = contentListFiltersSchema.parse({ status: "nope", sort: "nope" })
    expect(r.status).toBeUndefined()
    expect(r.sort).toBe("updated_at")
  })
})

describe("statusHistoryWriteSchema (SPEC §5.3 R5)", () => {
  it("accepts a transition record", () => {
    expect(
      statusHistoryWriteSchema.safeParse({
        content_item_id: "c1",
        from_status: "viet_kich_ban",
        to_status: "cho_duyet_kich_ban",
      }).success
    ).toBe(true)
  })

  it("accepts a return record with a reason", () => {
    expect(
      statusHistoryWriteSchema.safeParse({
        content_item_id: "c1",
        from_status: "cho_duyet_video",
        to_status: "quay_dung",
        reason: "Âm thanh chưa đạt",
      }).success
    ).toBe(true)
  })

  it("rejects a status outside the enum", () => {
    expect(
      statusHistoryWriteSchema.safeParse({
        content_item_id: "c1",
        from_status: "draft",
        to_status: "quay_dung",
      }).success
    ).toBe(false)
  })
})

describe("commentWriteSchema (SPEC §5.2 R5)", () => {
  it("accepts a comment with mentions", () => {
    const r = commentWriteSchema.safeParse({
      content_item_id: "c1",
      body: "@thang xem lại giúp",
      mentions: ["u-thang"],
    })
    expect(r.success).toBe(true)
  })

  it("defaults mentions to an empty array", () => {
    const r = commentWriteSchema.safeParse({
      content_item_id: "c1",
      body: "ok",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.mentions).toEqual([])
  })

  it("rejects an empty body", () => {
    expect(
      commentWriteSchema.safeParse({ content_item_id: "c1", body: "" }).success
    ).toBe(false)
  })
})
