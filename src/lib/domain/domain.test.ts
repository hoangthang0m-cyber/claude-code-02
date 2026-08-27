import { describe, expect, it } from "vitest"

import {
  CONTENT_ITEM_INITIAL_STATUS,
  CONTENT_STATUSES,
  COLLECTIONS,
  commentWriteSchema,
  contentItemCreateSchema,
  contentItemUpdateSchema,
  projectCreateSchema,
  projectMemberWriteSchema,
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

  it("collection ids match §6.1 entity names", () => {
    expect(COLLECTIONS).toEqual({
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

describe("projectMemberWriteSchema", () => {
  it("accepts a member with a skill tag", () => {
    expect(
      projectMemberWriteSchema.safeParse({
        project_id: "p1",
        user_id: "u1",
        project_role: "staff",
        skill_tag: "content",
      }).success
    ).toBe(true)
  })

  it("defaults skill_tag to null when omitted", () => {
    const r = projectMemberWriteSchema.safeParse({
      project_id: "p1",
      user_id: "u1",
      project_role: "manager",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.skill_tag).toBeNull()
  })

  it("rejects a project_role outside the enum", () => {
    expect(
      projectMemberWriteSchema.safeParse({
        project_id: "p1",
        user_id: "u1",
        project_role: "owner",
      }).success
    ).toBe(false)
  })
})

describe("contentItemCreateSchema (SPEC §5.2 R1)", () => {
  it("accepts code + project_id only", () => {
    expect(
      contentItemCreateSchema.safeParse({ project_id: "p1", code: "V001" })
        .success
    ).toBe(true)
  })

  it("rejects a missing code", () => {
    expect(
      contentItemCreateSchema.safeParse({ project_id: "p1" }).success
    ).toBe(false)
  })
})

describe("contentItemUpdateSchema", () => {
  it("accepts a partial update of a single field", () => {
    expect(
      contentItemUpdateSchema.safeParse({ topic: "Quay lại NYC" }).success
    ).toBe(true)
  })

  it("accepts a valid content_format", () => {
    expect(
      contentItemUpdateSchema.safeParse({ content_format: "reels" }).success
    ).toBe(true)
  })

  it("rejects a content_format outside the enum", () => {
    expect(
      contentItemUpdateSchema.safeParse({ content_format: "tiktok" }).success
    ).toBe(false)
  })

  it("rejects a malformed deadline", () => {
    expect(
      contentItemUpdateSchema.safeParse({ deadline: "31/12/2026" }).success
    ).toBe(false)
  })

  it("accepts an ISO deadline and a null (clear) deadline", () => {
    expect(
      contentItemUpdateSchema.safeParse({ deadline: "2026-09-01T00:00:00.000Z" })
        .success
    ).toBe(true)
    expect(contentItemUpdateSchema.safeParse({ deadline: null }).success).toBe(
      true
    )
  })

  it("does not allow status to be changed here (workflow only)", () => {
    const r = contentItemUpdateSchema.safeParse({ status: "da_len_ads" })
    // unknown key is stripped, not an error — but it must not appear in output
    expect(r.success).toBe(true)
    if (r.success) expect("status" in r.data).toBe(false)
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
