import { describe, expect, it } from "vitest"

import {
  isoWeekNumber,
  monthGridDays,
  rangeLabel,
  startOfWeek,
  stepAnchor,
  viewWindow,
  vnWeekday,
  weekDays,
  yearMonths,
} from "@/lib/domain/calendar/viewNavigation"

describe("startOfWeek / weekDays (Monday start)", () => {
  it("snaps to the Monday of the week", () => {
    // 2026-09-10 is a Thursday
    expect(vnWeekday("2026-09-10")).toBe(4)
    expect(startOfWeek("2026-09-10")).toBe("2026-09-07") // Monday
    expect(startOfWeek("2026-09-07")).toBe("2026-09-07")
    expect(startOfWeek("2026-09-13")).toBe("2026-09-07") // Sunday → same week
  })

  it("weekDays returns Mon…Sun", () => {
    expect(weekDays("2026-09-10")).toEqual([
      "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10",
      "2026-09-11", "2026-09-12", "2026-09-13",
    ])
  })
})

describe("monthGridDays", () => {
  it("is 42 days starting on a Monday, spilling into adjacent months (task 6.5)", () => {
    const grid = monthGridDays("2026-09-15")
    expect(grid).toHaveLength(42)
    expect(vnWeekday(grid[0])).toBe(1) // Monday
    expect(grid[0]).toBe("2026-08-31") // Sep 1 2026 is a Tuesday
    expect(grid).toContain("2026-09-01")
    expect(grid).toContain("2026-09-30")
    expect(grid[41]).toBe("2026-10-11")
  })
})

describe("viewWindow", () => {
  it("day / week / month / year / agenda", () => {
    expect(viewWindow("day", "2026-09-10")).toEqual({
      startDay: "2026-09-10",
      endDay: "2026-09-10",
    })
    expect(viewWindow("week", "2026-09-10")).toEqual({
      startDay: "2026-09-07",
      endDay: "2026-09-13",
    })
    expect(viewWindow("month", "2026-09-10")).toEqual({
      startDay: "2026-08-31",
      endDay: "2026-10-11",
    })
    expect(viewWindow("year", "2026-09-10")).toEqual({
      startDay: "2026-01-01",
      endDay: "2026-12-31",
    })
    expect(viewWindow("agenda", "2026-09-10")).toEqual({
      startDay: "2026-09-10",
      endDay: "2026-10-09",
    })
  })
})

describe("stepAnchor (task 6.8)", () => {
  it("steps by the view's unit", () => {
    expect(stepAnchor("day", "2026-09-10", 1)).toBe("2026-09-11")
    expect(stepAnchor("week", "2026-09-10", -1)).toBe("2026-09-03")
    expect(stepAnchor("month", "2026-09-10", 1)).toBe("2026-10-10")
    expect(stepAnchor("month", "2026-01-31", 1)).toBe("2026-02-28") // clamps
    expect(stepAnchor("year", "2026-09-10", 1)).toBe("2027-09-10")
    expect(stepAnchor("agenda", "2026-09-10", 1)).toBe("2026-10-10")
  })
})

describe("rangeLabel", () => {
  it("reads naturally per view", () => {
    expect(rangeLabel("day", "2026-09-10")).toBe("10 Tháng 9, 2026")
    expect(rangeLabel("week", "2026-09-10")).toBe("7–13 Tháng 9 2026")
    expect(rangeLabel("month", "2026-09-10")).toBe("Tháng 9 2026")
    expect(rangeLabel("year", "2026-09-10")).toBe("2026")
    expect(rangeLabel("week", "2026-09-30")).toBe(
      "28 Tháng 9 – 4 Tháng 10 2026"
    )
  })
})

describe("isoWeekNumber (task 6.9)", () => {
  it("matches known ISO week numbers", () => {
    expect(isoWeekNumber("2026-01-01")).toBe(1)
    expect(isoWeekNumber("2026-09-10")).toBe(37)
    expect(isoWeekNumber("2025-12-29")).toBe(1) // belongs to 2026 W1
  })
})

describe("yearMonths", () => {
  it("12 months, each a 42-day grid", () => {
    const y = yearMonths(2026)
    expect(y).toHaveLength(12)
    expect(y[0].monthKey).toBe("2026-01")
    expect(y[8].label).toBe("Tháng 9")
    expect(y[8].grid).toHaveLength(42)
  })
})
