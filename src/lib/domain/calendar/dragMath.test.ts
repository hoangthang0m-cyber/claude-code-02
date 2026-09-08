import { describe, expect, it } from "vitest"

import {
  applyDragMove,
  applyResize,
  pxToSnappedMinute,
  quickCreateBounds,
  snapMinutes,
} from "@/lib/domain/calendar/dragMath"

const utc = (iso: string) => Date.parse(iso)
const HOUR = 3_600_000

describe("snapMinutes (task 7.2)", () => {
  it("rounds to the nearest 15", () => {
    expect(snapMinutes(607)).toBe(600) // 10:07 → 10:00
    expect(snapMinutes(608)).toBe(615) // 10:08 → 10:15
    expect(snapMinutes(600)).toBe(600)
    expect(snapMinutes(-7)).toBe(0)
  })
})

describe("pxToSnappedMinute", () => {
  it("converts a pixel offset to a snapped minute, clamped to the day", () => {
    expect(pxToSnappedMinute(48, 48)).toBe(60) // 1 hour down
    expect(pxToSnappedMinute(48 * 9.1, 48)).toBe(540) // 09:06 → 09:00
    expect(pxToSnappedMinute(48 * 9.2, 48)).toBe(555) // 09:12 → 09:15
    expect(pxToSnappedMinute(-100, 48)).toBe(0)
    expect(pxToSnappedMinute(48 * 30, 48)).toBe(1440)
  })
})

describe("applyDragMove (task 7.3)", () => {
  const item = {
    startAt: utc("2026-09-10T02:00:00Z"), // 09:00 VN
    endAt: utc("2026-09-10T03:00:00Z"), // 10:00 VN — 1h
  }

  it("shifts by minutes, keeping duration", () => {
    const r = applyDragMove(item, { deltaMinutes: 240 })
    expect(r.startMs).toBe(utc("2026-09-10T06:00:00Z"))
    expect(r.endMs - r.startMs).toBe(HOUR)
  })

  it("shifts by whole days", () => {
    const r = applyDragMove(item, { deltaDays: 2 })
    expect(r.startMs).toBe(utc("2026-09-12T02:00:00Z"))
  })

  it("snaps the minute delta", () => {
    expect(applyDragMove(item, { deltaMinutes: 37 }).startMs).toBe(
      item.startAt + 30 * 60_000
    )
    expect(applyDragMove(item, { deltaMinutes: 38 }).startMs).toBe(
      item.startAt + 45 * 60_000
    )
  })
})

describe("applyResize (task 7.5)", () => {
  const item = {
    startAt: utc("2026-09-10T02:00:00Z"),
    endAt: utc("2026-09-10T03:00:00Z"),
  }

  it("extends the end edge, snapped", () => {
    const r = applyResize(item, "end", 30)
    expect(r.endMs).toBe(utc("2026-09-10T03:30:00Z"))
    expect(r.startMs).toBe(item.startAt)
  })

  it("never lets a resize go below 15 minutes", () => {
    expect(applyResize(item, "end", -90).endMs - item.startAt).toBe(15 * 60_000)
    expect(item.endAt - applyResize(item, "start", 90).startMs).toBe(15 * 60_000)
  })
})

describe("quickCreateBounds (task 7.1)", () => {
  it("Day/Week → a 60' timed block at the slot", () => {
    const slot = utc("2026-09-10T07:00:00Z")
    expect(quickCreateBounds("week", slot)).toEqual({
      startMs: slot,
      endMs: slot + HOUR,
      allDay: false,
    })
  })

  it("Month → an all-day block for the day", () => {
    const day = utc("2026-09-09T17:00:00Z") // VN midnight of the 10th
    expect(quickCreateBounds("month", day)).toEqual({
      startMs: day,
      endMs: day + 24 * HOUR,
      allDay: true,
    })
  })
})
