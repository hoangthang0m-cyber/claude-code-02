import { describe, expect, it } from "vitest"

import {
  COLLECTIONS,
  NOTIFICATION_TYPE_GROUP,
  NOTIFICATION_TYPES,
  adAccountConnectionWriteSchema,
  adsBindingCreateSchema,
  adsMetricManualSchema,
  adsMetricWriteSchema,
  notificationPreferenceWriteSchema,
  notificationWriteSchema,
  parseSheetUrl,
  sheetSyncMappingWriteSchema,
  syncConflictWriteSchema,
  syncRunWriteSchema,
} from "@/lib/domain"

// Group 7.1 task 1.3 — schema for the 8 ads / sheets-sync / notification
// entities (SPEC §6.1). Same "clean" check as task 1.2: accept a valid body,
// reject a bad enum or a missing required field.

describe("collection registry", () => {
  it("includes the task 1.3 collections plus googleConnections (task 6.1)", () => {
    expect(Object.keys(COLLECTIONS)).toEqual([
      "users",
      "projects",
      "projectMembers",
      "contentItems",
      "statusHistory",
      "comments",
      "adAccountConnections",
      "adsBindings",
      "adsMetrics",
      "sheetSyncMappings",
      "syncRuns",
      "syncConflicts",
      "googleConnections",
      "notifications",
      "notificationPreferences",
      "projectGroups",
    ])
  })
})

describe("adAccountConnectionWriteSchema (SPEC §5.4 R1)", () => {
  it("accepts a connection, defaulting state to connected", () => {
    const r = adAccountConnectionWriteSchema.safeParse({
      project_owner_id: "u-manager",
      ad_account_id: "act_123",
      name: "Hẻm Tarot Ads",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.state).toBe("connected")
  })

  it("rejects a state outside the enum", () => {
    expect(
      adAccountConnectionWriteSchema.safeParse({
        project_owner_id: "u",
        ad_account_id: "a",
        name: "n",
        state: "expired",
      }).success
    ).toBe(false)
  })
})

describe("adsBindingCreateSchema (SPEC §5.4 R2)", () => {
  it("accepts a campaign/adset/ad binding (content_item_id comes from the URL)", () => {
    expect(
      adsBindingCreateSchema.safeParse({
        ad_account_id: "act_1",
        object_level: "ad",
        object_id: "6123",
      }).success
    ).toBe(true)
  })

  it("rejects an object_level outside the enum", () => {
    expect(
      adsBindingCreateSchema.safeParse({
        ad_account_id: "act_1",
        object_level: "post",
        object_id: "6123",
      }).success
    ).toBe(false)
  })
})

describe("adsMetricWriteSchema (SPEC §5.4 R3/R4, §6.1 append-only)", () => {
  it("accepts a synced metric record", () => {
    expect(
      adsMetricWriteSchema.safeParse({
        content_item_id: "c1",
        source: "synced",
        spend: 1500000,
        messages: 42,
        cost_per_purchase: 35714,
        roas: 2.4,
        ctr: 1.8,
        delivery_status: "active",
        data_as_of: "2026-08-27T00:00:00.000Z",
      }).success
    ).toBe(true)
  })

  it("rejects a negative number", () => {
    expect(
      adsMetricWriteSchema.safeParse({
        content_item_id: "c1",
        source: "manual",
        spend: -1,
        messages: 0,
        cost_per_purchase: 0,
        roas: 0,
        ctr: 0,
        data_as_of: "2026-08-27T00:00:00.000Z",
      }).success
    ).toBe(false)
  })

  it("rejects a source outside the enum", () => {
    expect(
      adsMetricWriteSchema.safeParse({
        content_item_id: "c1",
        source: "imported",
        spend: 0,
        messages: 0,
        cost_per_purchase: 0,
        roas: 0,
        ctr: 0,
        data_as_of: "2026-08-27T00:00:00.000Z",
      }).success
    ).toBe(false)
  })
})

describe("adsMetricManualSchema (SPEC §5.4 R4)", () => {
  it("accepts a partial manual entry, defaulting the rest to 0 / now", () => {
    const r = adsMetricManualSchema.safeParse({ roas: 3.2, cost_per_purchase: 40000 })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.roas).toBe(3.2)
      expect(r.data.spend).toBe(0)
      expect(r.data.messages).toBe(0)
      expect(r.data.delivery_status).toBe("unknown")
      expect(r.data.data_as_of).toBeUndefined()
    }
  })

  it("rejects a negative figure", () => {
    expect(adsMetricManualSchema.safeParse({ roas: -1 }).success).toBe(false)
  })
})

describe("sheetSyncMappingWriteSchema (SPEC §5.5 R1)", () => {
  it("accepts a mapping, defaulting conflict_rule to system_wins", () => {
    const r = sheetSyncMappingWriteSchema.safeParse({
      project_id: "p1",
      spreadsheet_id: "1AbC",
      sheet_tab: "Tiến độ",
      header_row: 1,
      column_map: { deadline: "C", assignee_id: "D", status: "F" },
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.conflict_rule).toBe("system_wins")
  })

  it("rejects a non-positive header_row", () => {
    expect(
      sheetSyncMappingWriteSchema.safeParse({
        project_id: "p1",
        spreadsheet_id: "1AbC",
        sheet_tab: "T",
        header_row: 0,
        column_map: {},
      }).success
    ).toBe(false)
  })

  it("rejects a conflict_rule outside the enum", () => {
    expect(
      sheetSyncMappingWriteSchema.safeParse({
        project_id: "p1",
        spreadsheet_id: "1AbC",
        sheet_tab: "T",
        header_row: 1,
        column_map: {},
        conflict_rule: "latest_wins",
      }).success
    ).toBe(false)
  })
})

describe("parseSheetUrl (SPEC §5.1 R1 / §5.5 R1, task 6.1)", () => {
  it("pulls the spreadsheet id and gid from a full edit URL", () => {
    expect(
      parseSheetUrl(
        "https://docs.google.com/spreadsheets/d/1A2b3C_d-EF/edit#gid=123456"
      )
    ).toEqual({ spreadsheet_id: "1A2b3C_d-EF", sheet_gid: 123456 })
  })

  it("handles ?gid= and &gid= too", () => {
    expect(
      parseSheetUrl("https://docs.google.com/spreadsheets/d/XYZ/edit?gid=7")
    ).toEqual({ spreadsheet_id: "XYZ", sheet_gid: 7 })
    expect(
      parseSheetUrl(
        "https://docs.google.com/spreadsheets/d/XYZ/edit?usp=sharing&gid=9"
      )
    ).toEqual({ spreadsheet_id: "XYZ", sheet_gid: 9 })
  })

  it("returns null gid when the URL has no tab", () => {
    expect(
      parseSheetUrl("https://docs.google.com/spreadsheets/d/ABC/edit")
    ).toEqual({ spreadsheet_id: "ABC", sheet_gid: null })
  })

  it("returns null for a non-Sheets URL", () => {
    expect(parseSheetUrl("https://docs.google.com/document/d/ABC/edit")).toBeNull()
    expect(parseSheetUrl("not a url")).toBeNull()
    expect(parseSheetUrl("")).toBeNull()
  })
})

describe("syncRunWriteSchema / syncConflictWriteSchema (SPEC §5.5 R3/R4)", () => {
  it("accepts a sync run with default row counts", () => {
    const r = syncRunWriteSchema.safeParse({ project_id: "p1", kind: "sheets" })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.rows_read).toBe(0)
      expect(r.data.rows_written).toBe(0)
    }
  })

  it("rejects a sync kind outside the enum", () => {
    expect(
      syncRunWriteSchema.safeParse({ project_id: "p1", kind: "tiktok" }).success
    ).toBe(false)
  })

  it("accepts a conflict record", () => {
    expect(
      syncConflictWriteSchema.safeParse({
        project_id: "p1",
        content_item_id: "c1",
        field: "deadline",
        system_value: "2026-09-01",
        sheet_value: "2026-09-03",
        chosen_side: "system",
      }).success
    ).toBe(true)
  })

  it("rejects a chosen_side outside the enum", () => {
    expect(
      syncConflictWriteSchema.safeParse({
        project_id: "p1",
        content_item_id: "c1",
        field: "deadline",
        system_value: "a",
        sheet_value: "b",
        chosen_side: "manual",
      }).success
    ).toBe(false)
  })
})

describe("notification schemas (SPEC §5.7)", () => {
  it("every notification type maps to a preference group", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPE_GROUP[type]).toBeDefined()
    }
  })

  it("accepts a notification with an optional content_item_id", () => {
    expect(
      notificationWriteSchema.safeParse({
        recipient_id: "u1",
        type: "content_assigned",
        content_item_id: "c1",
        message: "Bạn được giao hạng mục V001",
      }).success
    ).toBe(true)
  })

  it("rejects a notification type outside the enum", () => {
    expect(
      notificationWriteSchema.safeParse({
        recipient_id: "u1",
        type: "project_archived",
        message: "x",
      }).success
    ).toBe(false)
  })

  it("accepts a preference toggle", () => {
    expect(
      notificationPreferenceWriteSchema.safeParse({
        user_id: "u1",
        group: "comment_mention",
        enabled: false,
      }).success
    ).toBe(true)
  })

  it("rejects a preference group outside the enum", () => {
    expect(
      notificationPreferenceWriteSchema.safeParse({
        user_id: "u1",
        group: "email",
        enabled: true,
      }).success
    ).toBe(false)
  })
})
