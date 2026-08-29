import { describe, expect, it } from "vitest"

import {
  ICT_OFFSET_MS,
  resolveReportPeriod,
} from "@/lib/domain/reportPeriod"

const WEEK = 7 * 24 * 60 * 60 * 1000

// local (Asia/Ho_Chi_Minh) midnight of a Y-M-D as an epoch ms
const localMidnight = (y: number, m: number, d: number) =>
  Date.UTC(y, m - 1, d) - ICT_OFFSET_MS

describe("resolveReportPeriod — month (SPEC §8 Q4)", () => {
  it("spans the local calendar month, previous is the month before", () => {
    const p = resolveReportPeriod("month", "2026-09-15")
    expect(p.start).toBe(localMidnight(2026, 9, 1))
    expect(p.end).toBe(localMidnight(2026, 10, 1))
    expect(p.previous).toEqual({
      start: localMidnight(2026, 8, 1),
      end: localMidnight(2026, 9, 1),
      start_date: "2026-08-01",
    })
    expect(p.start_date).toBe("2026-09-01")
  })

  it("month start is local midnight = 17:00 UTC the day before (UTC+7)", () => {
    const p = resolveReportPeriod("month", "2026-09-01")
    expect(new Date(p.start).toISOString()).toBe("2026-08-31T17:00:00.000Z")
  })

  it("rolls the year for a January period", () => {
    const p = resolveReportPeriod("month", "2026-01-20")
    expect(p.previous.start).toBe(localMidnight(2025, 12, 1))
  })
})

describe("resolveReportPeriod — week (Monday start, ISO-8601)", () => {
  it("a mid-week date backs up to that week's Monday", () => {
    // 2026-09-16 is a Wednesday
    const p = resolveReportPeriod("week", "2026-09-16")
    expect(p.start_date).toBe("2026-09-14") // Monday
    expect(p.end - p.start).toBe(WEEK)
    expect(p.previous).toMatchObject({ start: p.start - WEEK, end: p.start })
    expect(p.previous.start_date).toBe("2026-09-07")
  })

  it("Monday maps to itself", () => {
    const p = resolveReportPeriod("week", "2026-09-14")
    expect(p.start_date).toBe("2026-09-14")
  })

  it("Sunday belongs to the week that started the previous Monday", () => {
    // 2026-09-20 is a Sunday
    const p = resolveReportPeriod("week", "2026-09-20")
    expect(p.start_date).toBe("2026-09-14")
  })

  it("a week can start in the previous month", () => {
    // 2026-10-01 is a Thursday → that week's Monday is 2026-09-28
    const p = resolveReportPeriod("week", "2026-10-01")
    expect(p.start_date).toBe("2026-09-28")
  })

  it("the anchor date always falls inside [start, end)", () => {
    for (const date of ["2026-02-01", "2026-06-15", "2026-12-31"]) {
      const p = resolveReportPeriod("week", date)
      const anchorLocalMidnight =
        Date.UTC(
          Number(date.slice(0, 4)),
          Number(date.slice(5, 7)) - 1,
          Number(date.slice(8, 10))
        ) - ICT_OFFSET_MS
      expect(anchorLocalMidnight).toBeGreaterThanOrEqual(p.start)
      expect(anchorLocalMidnight).toBeLessThan(p.end)
    }
  })
})

describe("resolveReportPeriod — validation", () => {
  it("throws on a malformed or impossible date", () => {
    expect(() => resolveReportPeriod("month", "2026-9-1")).toThrow()
    expect(() => resolveReportPeriod("week", "2026-13-01")).toThrow()
    expect(() => resolveReportPeriod("week", "2026-02-30")).toThrow()
    expect(() => resolveReportPeriod("month", "hôm nay")).toThrow()
  })
})
