import { describe, expect, it } from "vitest"

import { vnDayStartMs } from "@/lib/domain/calendar/dayFields"
import {
  itemDayBounds,
  minutesIntoDay,
  nowLinePercent,
} from "@/lib/domain/calendar/timedLayout"

const utc = (iso: string) => Date.parse(iso)

describe("minutesIntoDay", () => {
  it("counts minutes from VN midnight, clamped", () => {
    expect(minutesIntoDay(utc("2026-09-10T02:00:00Z"), "2026-09-10")).toBe(540) // 09:00 VN
    expect(minutesIntoDay(utc("2026-09-10T09:30:00Z"), "2026-09-10")).toBe(990) // 16:30
    expect(minutesIntoDay(vnDayStartMs("2026-09-09"), "2026-09-10")).toBe(0) // before → clamp 0
    expect(minutesIntoDay(vnDayStartMs("2026-09-12"), "2026-09-10")).toBe(1440) // after → clamp
  })
})

describe("itemDayBounds", () => {
  it("clips a multi-day item to the column day and keeps min height", () => {
    const item = {
      startAt: utc("2026-09-10T15:00:00Z"), // 22:00 VN on the 10th
      endAt: utc("2026-09-11T02:00:00Z"), // 09:00 VN on the 11th
    }
    expect(itemDayBounds(item, "2026-09-10")).toEqual({
      topMin: 1320,
      bottomMin: 1440,
    })
    expect(itemDayBounds(item, "2026-09-11")).toEqual({
      topMin: 0,
      bottomMin: 540,
    })
  })
})

describe("nowLinePercent (task 6.4)", () => {
  it("returns a percentage only for today's column", () => {
    const now = utc("2026-09-10T05:00:00Z") // 12:00 VN
    expect(nowLinePercent(now, "2026-09-10")).toBeCloseTo((720 / 1440) * 100)
    expect(nowLinePercent(now, "2026-09-11")).toBeNull()
  })
})
