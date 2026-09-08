import { describe, expect, it } from "vitest"

import { vnDayStartMs } from "@/lib/domain/calendar/dayFields"
import {
  formatItemTimeRange,
  toVnInputDate,
  toVnInputDateTime,
  vnDateInputToMs,
  vnDateTimeInputToMs,
} from "@/lib/domain/calendar/format"

const utc = (iso: string) => Date.parse(iso)

describe("formatItemTimeRange", () => {
  it("timed, same day", () => {
    expect(
      formatItemTimeRange({
        startAt: utc("2026-09-10T02:00:00Z"), // 09:00 VN
        endAt: utc("2026-09-10T03:30:00Z"), // 10:30 VN
        allDay: false,
      })
    ).toBe("10/9/2026 · 09:00–10:30")
  })

  it("all-day, one day", () => {
    expect(
      formatItemTimeRange({
        startAt: vnDayStartMs("2026-09-10"),
        endAt: vnDayStartMs("2026-09-11"),
        allDay: true,
      })
    ).toBe("Cả ngày · 10/9/2026")
  })

  it("all-day, multi-day shows the inclusive last day", () => {
    expect(
      formatItemTimeRange({
        startAt: vnDayStartMs("2026-09-01"),
        endAt: vnDayStartMs("2026-10-01"),
        allDay: true,
      })
    ).toBe("Cả ngày · 1/9/2026 – 30/9/2026")
  })
})

describe("VN input round-trips", () => {
  it("date input ↔ ms", () => {
    expect(vnDateInputToMs("2026-09-10")).toBe(vnDayStartMs("2026-09-10"))
    expect(toVnInputDate(vnDayStartMs("2026-09-10"))).toBe("2026-09-10")
  })

  it("datetime-local input ↔ ms", () => {
    const ms = vnDateTimeInputToMs("2026-09-10T09:00")
    expect(ms).toBe(utc("2026-09-10T02:00:00Z"))
    expect(toVnInputDateTime(ms)).toBe("2026-09-10T09:00")
  })
})
