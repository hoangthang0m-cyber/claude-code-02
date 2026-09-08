import { describe, expect, it } from "vitest"

import {
  computeDayFields,
  daysBetweenKeys,
  enumerateDayKeys,
  toMillis,
  vnDateKey,
  vnDayStartMs,
} from "@/lib/domain/calendar/dayFields"

const utc = (iso: string) => Date.parse(iso)

describe("vnDateKey / vnDayStartMs", () => {
  it("maps a UTC instant to its VN calendar date (UTC+7)", () => {
    // 2026-09-10 23:30 VN is still the 10th
    expect(vnDateKey(utc("2026-09-10T16:30:00Z"))).toBe("2026-09-10")
    // 2026-09-10 18:00 UTC = 2026-09-11 01:00 VN
    expect(vnDateKey(utc("2026-09-10T18:00:00Z"))).toBe("2026-09-11")
  })

  it("round-trips a date key through VN midnight", () => {
    expect(vnDateKey(vnDayStartMs("2026-09-10"))).toBe("2026-09-10")
    expect(vnDayStartMs("2026-09-10")).toBe(utc("2026-09-09T17:00:00Z"))
  })
})

describe("daysBetweenKeys / enumerateDayKeys", () => {
  it("counts inclusive days across a month boundary", () => {
    expect(daysBetweenKeys("2026-08-30", "2026-09-02")).toBe(4)
    expect(daysBetweenKeys("2026-09-10", "2026-09-10")).toBe(1)
  })

  it("enumerates every day key", () => {
    expect(enumerateDayKeys("2026-08-30", 4)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ])
  })
})

describe("toMillis", () => {
  it("accepts number / Date / Timestamp-like / {seconds,nanoseconds}", () => {
    expect(toMillis(1000)).toBe(1000)
    expect(toMillis(new Date(1000))).toBe(1000)
    expect(toMillis({ toMillis: () => 1000 })).toBe(1000)
    expect(toMillis({ seconds: 1, nanoseconds: 500_000_000 })).toBe(1500)
  })
})

describe("computeDayFields", () => {
  it("timed item within one day (09:00–10:30 VN)", () => {
    const f = computeDayFields({
      startAt: utc("2026-09-10T02:00:00Z"),
      endAt: utc("2026-09-10T03:30:00Z"),
    })
    expect(f).toEqual({
      startDay: "2026-09-10",
      endDay: "2026-09-10",
      spanDays: 1,
      dayKeys: ["2026-09-10"],
      isLongSpan: false,
    })
  })

  it("all-day item, one day", () => {
    const f = computeDayFields({
      allDay: true,
      startAt: vnDayStartMs("2026-09-10"),
      endAt: vnDayStartMs("2026-09-11"),
    })
    expect(f.startDay).toBe("2026-09-10")
    expect(f.endDay).toBe("2026-09-10")
    expect(f.spanDays).toBe(1)
    expect(f.dayKeys).toEqual(["2026-09-10"])
  })

  it("all-day item, 10 days (1st–10th)", () => {
    const f = computeDayFields({
      allDay: true,
      startAt: vnDayStartMs("2026-09-01"),
      endAt: vnDayStartMs("2026-09-11"),
    })
    expect(f.startDay).toBe("2026-09-01")
    expect(f.endDay).toBe("2026-09-10")
    expect(f.spanDays).toBe(10)
    expect(f.dayKeys).toHaveLength(10)
    expect(f.isLongSpan).toBe(false)
  })

  it("90-day goal → long-span, no dayKeys", () => {
    const f = computeDayFields({
      allDay: true,
      startAt: vnDayStartMs("2026-07-01"),
      endAt: vnDayStartMs("2026-09-29"), // 90 inclusive days
    })
    expect(f.spanDays).toBe(90)
    expect(f.isLongSpan).toBe(true)
    expect(f.dayKeys).toBeNull()
  })

  it("exactly 45 days stays short; 46 flips to long-span", () => {
    expect(
      computeDayFields({
        allDay: true,
        startAt: vnDayStartMs("2026-09-01"),
        endAt: vnDayStartMs("2026-10-16"), // 45 inclusive days
      }).isLongSpan
    ).toBe(false)
    expect(
      computeDayFields({
        allDay: true,
        startAt: vnDayStartMs("2026-09-01"),
        endAt: vnDayStartMs("2026-10-17"), // 46
      }).isLongSpan
    ).toBe(true)
  })

  it("timed item crossing midnight touches both days", () => {
    const f = computeDayFields({
      startAt: utc("2026-09-10T15:00:00Z"), // 22:00 VN
      endAt: utc("2026-09-10T19:00:00Z"), // 02:00 VN next day
    })
    expect(f.startDay).toBe("2026-09-10")
    expect(f.endDay).toBe("2026-09-11")
    expect(f.spanDays).toBe(2)
    expect(f.dayKeys).toEqual(["2026-09-10", "2026-09-11"])
  })

  it("end exactly at VN midnight does not add the next day", () => {
    const f = computeDayFields({
      startAt: vnDayStartMs("2026-09-10"),
      endAt: vnDayStartMs("2026-09-11"),
      allDay: false,
    })
    expect(f.endDay).toBe("2026-09-10")
    expect(f.spanDays).toBe(1)
  })

  it("month-crossing span includes both Aug and Sep keys", () => {
    const f = computeDayFields({
      allDay: true,
      startAt: vnDayStartMs("2026-08-25"),
      endAt: vnDayStartMs("2026-09-06"),
    })
    expect(f.startDay).toBe("2026-08-25")
    expect(f.endDay).toBe("2026-09-05")
    expect(f.dayKeys).toContain("2026-08-31")
    expect(f.dayKeys).toContain("2026-09-01")
  })
})
