import { describe, expect, it } from "vitest"

import type { CalendarItem } from "@/lib/domain/calendar/calendarItem"
import {
  itemOverlapsWindow,
  partitionViewItems,
  planViewQueries,
} from "@/lib/domain/calendar/viewQuery"

function item(over: Partial<CalendarItem>): CalendarItem {
  return {
    id: "x",
    calendarId: "calA",
    type: "task",
    title: "",
    description: null,
    location: null,
    allDay: false,
    startAt: { toMillis: () => Date.parse("2026-09-10T02:00:00Z") } as never,
    endAt: { toMillis: () => Date.parse("2026-09-10T03:00:00Z") } as never,
    startDay: "2026-09-10",
    endDay: "2026-09-10",
    spanDays: 1,
    dayKeys: ["2026-09-10"],
    isLongSpan: false,
    isRecurring: false,
    colorOverride: null,
    assigneeIds: [],
    primaryAssigneeId: null,
    linkedProjectId: null,
    linkedContentItemId: null,
    reminders: [],
    recurrence: null,
    recurrenceId: null,
    createdBy: "u1",
    createdAt: null as never,
    updatedAt: null as never,
    deletedAt: null,
    ...over,
  }
}

describe("planViewQueries", () => {
  it("one batch for a week window", () => {
    const plan = planViewQueries({ startDay: "2026-09-07", endDay: "2026-09-13" })
    expect(plan.dayKeyBatches).toHaveLength(1)
    expect(plan.dayKeyBatches[0]).toHaveLength(7)
  })

  it("splits a 6-week month window into two ≤30 batches", () => {
    const plan = planViewQueries({ startDay: "2026-08-31", endDay: "2026-10-11" }) // 42 days
    expect(plan.dayKeyBatches).toHaveLength(2)
    expect(plan.dayKeyBatches[0]).toHaveLength(30)
    expect(plan.dayKeyBatches[1]).toHaveLength(12)
    expect(plan.dayKeyBatches.flat()).toContain("2026-09-15")
  })
})

describe("itemOverlapsWindow", () => {
  const w = { startDay: "2026-09-01", endDay: "2026-09-30" }
  it("true when the spans intersect", () => {
    expect(itemOverlapsWindow({ startDay: "2026-08-20", endDay: "2026-09-02" }, w)).toBe(true)
    expect(itemOverlapsWindow({ startDay: "2026-09-29", endDay: "2026-10-10" }, w)).toBe(true)
    expect(itemOverlapsWindow({ startDay: "2026-09-10", endDay: "2026-09-10" }, w)).toBe(true)
  })
  it("false when entirely outside", () => {
    expect(itemOverlapsWindow({ startDay: "2026-08-01", endDay: "2026-08-31" }, w)).toBe(false)
    expect(itemOverlapsWindow({ startDay: "2026-10-01", endDay: "2026-10-05" }, w)).toBe(false)
  })
})

describe("partitionViewItems", () => {
  const window = { startDay: "2026-09-01", endDay: "2026-09-30" }
  const visibleCalendarIds = new Set(["calA", "calB"])

  it("dedupes by id and drops soft-deleted / hidden-calendar / out-of-window", () => {
    const raw = new Map<string, CalendarItem>([
      ["a", item({ id: "a", startDay: "2026-09-05", endDay: "2026-09-05", dayKeys: ["2026-09-05"] })],
      ["a", item({ id: "a", startDay: "2026-09-05", endDay: "2026-09-05" })], // same id, kept once
      ["b", item({ id: "b", deletedAt: { toMillis: () => 1 } as never })],
      ["c", item({ id: "c", calendarId: "calHidden" })],
      ["d", item({ id: "d", startDay: "2026-08-01", endDay: "2026-08-20" })],
    ])
    const { items, recurringMasters } = partitionViewItems(raw, {
      window,
      visibleCalendarIds,
    })
    expect(items.map((i) => i.id)).toEqual(["a"])
    expect(recurringMasters).toHaveLength(0)
  })

  it("splits recurring masters out, keeping series that start on/before window end", () => {
    const raw = new Map<string, CalendarItem>([
      ["r1", item({ id: "r1", isRecurring: true, startDay: "2026-01-01", endDay: "2026-01-01" })],
      ["r2", item({ id: "r2", isRecurring: true, startDay: "2026-12-01", endDay: "2026-12-01" })],
      ["t1", item({ id: "t1", startDay: "2026-09-12", endDay: "2026-09-12" })],
    ])
    const { items, recurringMasters } = partitionViewItems(raw, {
      window,
      visibleCalendarIds,
    })
    expect(items.map((i) => i.id)).toEqual(["t1"])
    expect(recurringMasters.map((i) => i.id)).toEqual(["r1"])
  })

  it("sorts by start instant", () => {
    const raw = new Map<string, CalendarItem>([
      ["late", item({ id: "late", startAt: { toMillis: () => 3000 } as never, startDay: "2026-09-10", endDay: "2026-09-10" })],
      ["early", item({ id: "early", startAt: { toMillis: () => 1000 } as never, startDay: "2026-09-10", endDay: "2026-09-10" })],
    ])
    expect(
      partitionViewItems(raw, { window, visibleCalendarIds }).items.map((i) => i.id)
    ).toEqual(["early", "late"])
  })
})
