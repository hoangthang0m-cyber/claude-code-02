import { describe, expect, it } from "vitest"

import type { CalendarItem } from "@/lib/domain/calendar/calendarItem"
import type { CalendarItemType } from "@/lib/domain/calendar/enums"
import {
  activeFilterCount,
  EMPTY_FILTERS,
  hasActiveFilters,
  itemMatchesFilters,
  type CalendarFilters,
} from "@/lib/domain/calendar/filters"

type ItemSlice = Pick<
  CalendarItem,
  "assigneeIds" | "type" | "linkedProjectId"
>

const item = (
  over: Partial<ItemSlice> = {}
): ItemSlice => ({
  assigneeIds: [],
  type: "task" as CalendarItemType,
  linkedProjectId: null,
  ...over,
})

const f = (over: Partial<CalendarFilters> = {}): CalendarFilters => ({
  ...EMPTY_FILTERS,
  ...over,
})

describe("itemMatchesFilters", () => {
  it("no filters → everything matches", () => {
    expect(itemMatchesFilters(item(), EMPTY_FILTERS, "u1")).toBe(true)
  })

  it("assignee filter is an OR (task 9.4)", () => {
    const filter = f({ assigneeIds: ["an", "binh"] })
    expect(itemMatchesFilters(item({ assigneeIds: ["an"] }), filter, null)).toBe(true)
    expect(
      itemMatchesFilters(item({ assigneeIds: ["binh", "cuong"] }), filter, null)
    ).toBe(true)
    expect(itemMatchesFilters(item({ assigneeIds: ["cuong"] }), filter, null)).toBe(
      false
    )
    expect(itemMatchesFilters(item({ assigneeIds: [] }), filter, null)).toBe(false)
  })

  it("'mine' adds the current uid to the wanted set (task 9.5)", () => {
    const filter = f({ mine: true })
    expect(itemMatchesFilters(item({ assigneeIds: ["me"] }), filter, "me")).toBe(true)
    expect(itemMatchesFilters(item({ assigneeIds: ["other"] }), filter, "me")).toBe(
      false
    )
    // no current uid → the mine flag is inert
    expect(itemMatchesFilters(item({ assigneeIds: ["other"] }), filter, null)).toBe(
      true
    )
  })

  it("'mine' ORs with an explicit assignee list", () => {
    const filter = f({ mine: true, assigneeIds: ["an"] })
    expect(itemMatchesFilters(item({ assigneeIds: ["an"] }), filter, "me")).toBe(true)
    expect(itemMatchesFilters(item({ assigneeIds: ["me"] }), filter, "me")).toBe(true)
    expect(itemMatchesFilters(item({ assigneeIds: ["x"] }), filter, "me")).toBe(false)
  })

  it("type filter", () => {
    const filter = f({ types: ["goal"] })
    expect(itemMatchesFilters(item({ type: "goal" }), filter, null)).toBe(true)
    expect(itemMatchesFilters(item({ type: "task" }), filter, null)).toBe(false)
  })

  it("linked-project filter", () => {
    const filter = f({ projectId: "p1" })
    expect(itemMatchesFilters(item({ linkedProjectId: "p1" }), filter, null)).toBe(
      true
    )
    expect(itemMatchesFilters(item({ linkedProjectId: "p2" }), filter, null)).toBe(
      false
    )
    expect(itemMatchesFilters(item({ linkedProjectId: null }), filter, null)).toBe(
      false
    )
  })

  it("combines filters with AND", () => {
    const filter = f({ types: ["task"], assigneeIds: ["an"] })
    expect(
      itemMatchesFilters(item({ type: "task", assigneeIds: ["an"] }), filter, null)
    ).toBe(true)
    expect(
      itemMatchesFilters(item({ type: "task", assigneeIds: ["binh"] }), filter, null)
    ).toBe(false)
  })
})

describe("activeFilterCount / hasActiveFilters", () => {
  it("counts each active dimension once", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(
      activeFilterCount(f({ mine: true, assigneeIds: ["a"], types: ["goal"] }))
    ).toBe(3)
    expect(hasActiveFilters(f({ projectId: "p1" }))).toBe(true)
  })
})
