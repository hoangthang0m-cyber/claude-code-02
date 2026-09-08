import { describe, expect, it } from "vitest"

import {
  calendarNotificationMessage,
  reminderRecipientUids,
  reminderSendAtMs,
} from "@/lib/domain/calendar/calendarNotification"

describe("calendarNotificationMessage", () => {
  it("wording per Mục B", () => {
    expect(calendarNotificationMessage("assigned", "Họp team")).toBe(
      "Bạn được giao: Họp team"
    )
    expect(calendarNotificationMessage("unassigned", "Họp team")).toBe(
      "Bạn không còn đảm nhận: Họp team"
    )
    expect(calendarNotificationMessage("reminder", "Họp team")).toBe(
      "Sắp tới: Họp team"
    )
  })
})

describe("reminderRecipientUids (Mục B calendar-reminders — Người nhận nhắc)", () => {
  it("assignees ∪ creator, deduped", () => {
    expect(reminderRecipientUids(["an", "binh"], "mgr").sort()).toEqual([
      "an",
      "binh",
      "mgr",
    ])
  })

  it("creator only when there are no assignees", () => {
    expect(reminderRecipientUids([], "mgr")).toEqual(["mgr"])
  })

  it("creator who is also an assignee appears once", () => {
    expect(reminderRecipientUids(["an", "mgr"], "mgr").sort()).toEqual([
      "an",
      "mgr",
    ])
  })
})

describe("reminderSendAtMs", () => {
  it("start minus the offset", () => {
    const start = Date.parse("2026-09-10T09:00:00.000Z")
    expect(reminderSendAtMs(start, 10)).toBe(start - 10 * 60_000)
    expect(reminderSendAtMs(start, 0)).toBe(start)
  })
})
