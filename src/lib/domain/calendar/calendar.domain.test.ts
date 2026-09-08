import { describe, expect, it } from "vitest"

import {
  calendarCreateSchema,
  DEFAULT_SHARED_CALENDARS,
} from "@/lib/domain/calendar/calendar"
import {
  calendarItemCreateSchema,
  calendarItemDisplayTitle,
  CALENDAR_ITEM_UNTITLED,
  isValidItemRange,
  resolvePrimaryAssignee,
} from "@/lib/domain/calendar/calendarItem"
import { CALENDAR_COLOR_KEYS } from "@/lib/domain/calendar/enums"
import { memberInitials } from "@/lib/domain/calendar/member"
import { dueReminderId, SINGLE_OCCURRENCE_KEY } from "@/lib/domain/calendar/dueReminder"
import {
  offsetToParts,
  partsToOffset,
  reminderLabel,
  remindersSchema,
} from "@/lib/domain/calendar/reminder"

describe("calendarItemDisplayTitle", () => {
  it("falls back for empty / whitespace titles", () => {
    expect(calendarItemDisplayTitle("")).toBe(CALENDAR_ITEM_UNTITLED)
    expect(calendarItemDisplayTitle("   ")).toBe(CALENDAR_ITEM_UNTITLED)
    expect(calendarItemDisplayTitle(null)).toBe(CALENDAR_ITEM_UNTITLED)
    expect(calendarItemDisplayTitle("Ra mắt")).toBe("Ra mắt")
  })
})

describe("isValidItemRange", () => {
  it("timed items need end strictly after start", () => {
    expect(isValidItemRange(100, 200, false)).toBe(true)
    expect(isValidItemRange(200, 200, false)).toBe(false)
    expect(isValidItemRange(300, 200, false)).toBe(false)
  })

  it("all-day items allow a single day (end === start)", () => {
    expect(isValidItemRange(200, 200, true)).toBe(true)
    expect(isValidItemRange(300, 200, true)).toBe(false)
  })
})

describe("resolvePrimaryAssignee", () => {
  it("no assignees => no primary", () => {
    expect(resolvePrimaryAssignee([], null)).toBeNull()
    expect(resolvePrimaryAssignee([], "u1")).toBeNull()
  })

  it("defaults to the first assignee", () => {
    expect(resolvePrimaryAssignee(["u1", "u2"], null)).toBe("u1")
  })

  it("keeps a valid requested primary, ignores an invalid one", () => {
    expect(resolvePrimaryAssignee(["u1", "u2"], "u2")).toBe("u2")
    expect(resolvePrimaryAssignee(["u1", "u2"], "u3")).toBe("u1")
  })
})

describe("memberInitials", () => {
  it("derives 1-2 letter initials", () => {
    expect(memberInitials("An")).toBe("AN")
    expect(memberInitials("Nguyễn Văn An")).toBe("NA")
    expect(memberInitials("  ")).toBe("?")
  })
})

describe("dueReminderId", () => {
  it("is deterministic per item/occurrence/offset", () => {
    expect(dueReminderId("item1", SINGLE_OCCURRENCE_KEY, 10)).toBe(
      "item1_single_10"
    )
    expect(dueReminderId("item1", "2026-09-07", 30)).toBe("item1_2026-09-07_30")
  })
})

describe("reminder offset parts", () => {
  it("picks the largest whole unit", () => {
    expect(offsetToParts(10)).toEqual({ value: 10, unit: "minute" })
    expect(offsetToParts(60)).toEqual({ value: 1, unit: "hour" })
    expect(offsetToParts(90)).toEqual({ value: 90, unit: "minute" })
    expect(offsetToParts(1440)).toEqual({ value: 1, unit: "day" })
    expect(offsetToParts(10080)).toEqual({ value: 1, unit: "week" })
    expect(offsetToParts(0)).toEqual({ value: 0, unit: "minute" })
  })

  it("round-trips through partsToOffset", () => {
    expect(partsToOffset(2, "hour")).toBe(120)
    expect(partsToOffset(3, "day")).toBe(4320)
    expect(partsToOffset(-5, "hour")).toBe(0)
  })

  it("reminderLabel reads naturally", () => {
    expect(reminderLabel({ offsetMinutes: 0, channel: "inapp" })).toBe(
      "lúc bắt đầu"
    )
    expect(reminderLabel({ offsetMinutes: 10, channel: "inapp" })).toBe(
      "10 phút trước"
    )
    expect(reminderLabel({ offsetMinutes: 1440, channel: "inapp" })).toBe(
      "1 ngày trước"
    )
  })
})

describe("remindersSchema", () => {
  it("rejects more than 5 reminders", () => {
    const one = { offsetMinutes: 10, channel: "inapp" as const }
    expect(remindersSchema.safeParse(Array(5).fill(one)).success).toBe(true)
    expect(remindersSchema.safeParse(Array(6).fill(one)).success).toBe(false)
  })

  it("rejects negative offsets", () => {
    expect(
      remindersSchema.safeParse([{ offsetMinutes: -1, channel: "inapp" }]).success
    ).toBe(false)
  })
})

describe("calendarCreateSchema", () => {
  it("requires name and a known colour key", () => {
    expect(
      calendarCreateSchema.safeParse({ name: "X", color: "peacock" }).success
    ).toBe(true)
    expect(
      calendarCreateSchema.safeParse({ name: "", color: "peacock" }).success
    ).toBe(false)
    expect(
      calendarCreateSchema.safeParse({ name: "X", color: "not-a-colour" }).success
    ).toBe(false)
  })

  it("defaults writeScope to everyone and reminders to []", () => {
    const parsed = calendarCreateSchema.parse({ name: "X", color: "sage" })
    expect(parsed.writeScope).toBe("everyone")
    expect(parsed.defaultReminders).toEqual([])
  })
})

describe("calendarItemCreateSchema", () => {
  it("accepts a minimal timed item and defaults optional fields", () => {
    const parsed = calendarItemCreateSchema.parse({
      calendarId: "cal1",
      type: "activity",
      startAt: "2026-09-07T09:00:00.000Z",
      endAt: "2026-09-07T10:30:00.000Z",
    })
    expect(parsed.title).toBe("")
    expect(parsed.allDay).toBe(false)
    expect(parsed.assigneeIds).toEqual([])
    // reminders left optional so the service can inherit the calendar defaults
    expect(parsed.reminders).toBeUndefined()
    expect(parsed.recurrence).toBeNull()
  })

  it("rejects an unknown type", () => {
    expect(
      calendarItemCreateSchema.safeParse({
        calendarId: "cal1",
        type: "milestone",
        startAt: "2026-09-07T09:00:00.000Z",
        endAt: "2026-09-07T10:00:00.000Z",
      }).success
    ).toBe(false)
  })
})

describe("DEFAULT_SHARED_CALENDARS", () => {
  it("has the four spec calendars, only Mục tiêu phòng managerOnly", () => {
    expect(DEFAULT_SHARED_CALENDARS.map((c) => c.name)).toEqual([
      "Mục tiêu phòng",
      "Chiến dịch",
      "Nội dung",
      "Ads",
    ])
    const goals = DEFAULT_SHARED_CALENDARS.find((c) => c.name === "Mục tiêu phòng")
    expect(goals?.writeScope).toBe("managerOnly")
    expect(
      DEFAULT_SHARED_CALENDARS.filter((c) => c.writeScope === "everyone")
    ).toHaveLength(3)
  })

  it("has unique fixed ids and valid colours + reminders", () => {
    const ids = DEFAULT_SHARED_CALENDARS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of DEFAULT_SHARED_CALENDARS) {
      expect(c.id).toMatch(/^default_/)
      expect(CALENDAR_COLOR_KEYS).toContain(c.color)
      expect(c.defaultReminders.length).toBeGreaterThan(0)
      for (const r of c.defaultReminders) {
        expect(r.offsetMinutes).toBeGreaterThanOrEqual(0)
        expect(["inapp", "push"]).toContain(r.channel)
      }
    }
  })
})
