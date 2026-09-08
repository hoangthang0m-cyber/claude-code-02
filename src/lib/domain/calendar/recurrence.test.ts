import { describe, expect, it } from "vitest"

import type { CalendarItem } from "@/lib/domain/calendar/calendarItem"
import { vnDateKey, vnDayStartMs } from "@/lib/domain/calendar/dayFields"
import type { RecurrenceException } from "@/lib/domain/calendar/recurrenceException"
import {
  describeRecurrence,
  expandRecurrence,
  parseOccurrenceId,
  partsToRRuleString,
  previewOccurrences,
  rruleStringToParts,
} from "@/lib/domain/calendar/recurrence"

// A timestamp-ish for a VN wall-clock date + time.
function ts(dayKey: string, hour = 9) {
  const ms = vnDayStartMs(dayKey) + hour * 3_600_000
  return { toMillis: () => ms } as CalendarItem["startAt"]
}

function master(over: Partial<CalendarItem> & { recurrence: string }): CalendarItem {
  return {
    id: "m1",
    calendarId: "cal",
    type: "activity",
    title: "Chuỗi",
    description: null,
    location: null,
    allDay: false,
    startAt: ts("2026-09-07", 9), // Monday
    endAt: ts("2026-09-07", 10),
    startDay: "2026-09-07",
    endDay: "2026-09-07",
    spanDays: 1,
    dayKeys: ["2026-09-07"],
    isLongSpan: false,
    isRecurring: true,
    colorOverride: null,
    assigneeIds: [],
    primaryAssigneeId: null,
    linkedProjectId: null,
    linkedContentItemId: null,
    reminders: [],
    recurrenceId: null,
    createdBy: "u1",
    createdAt: null as never,
    updatedAt: null as never,
    deletedAt: null,
    ...over,
  }
}

const days = (items: { startDay: string }[]) => items.map((i) => i.startDay)

describe("expandRecurrence — rule kinds (task 8.1)", () => {
  it("daily", () => {
    const out = expandRecurrence(
      master({ recurrence: "FREQ=DAILY" }),
      [],
      "2026-09-07",
      "2026-09-10"
    )
    expect(days(out)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ])
  })

  it("weekly on Monday + Wednesday, COUNT 10", () => {
    const out = expandRecurrence(
      master({ recurrence: "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10" }),
      [],
      "2026-09-01",
      "2026-10-31"
    )
    expect(out).toHaveLength(10)
    // Mondays and Wednesdays only
    for (const o of out) {
      const wd = new Date(`${o.startDay}T00:00:00Z`).getUTCDay()
      expect([1, 3]).toContain(wd)
    }
  })

  it("monthly by date", () => {
    const out = expandRecurrence(
      master({
        recurrence: "FREQ=MONTHLY",
        startAt: ts("2026-01-10", 9),
        endAt: ts("2026-01-10", 10),
      }),
      [],
      "2026-01-01",
      "2026-04-30"
    )
    expect(days(out)).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
      "2026-04-10",
    ])
  })

  it("monthly by 'first Friday'", () => {
    // 2026-01-02 is the first Friday of Jan
    const out = expandRecurrence(
      master({
        recurrence: "FREQ=MONTHLY;BYDAY=FR;BYSETPOS=1",
        startAt: ts("2026-01-02", 9),
        endAt: ts("2026-01-02", 10),
      }),
      [],
      "2026-01-01",
      "2026-04-30"
    )
    for (const o of out) {
      const wd = new Date(`${o.startDay}T00:00:00Z`).getUTCDay()
      expect(wd).toBe(5) // Friday
      expect(Number(o.startDay.slice(8))).toBeLessThanOrEqual(7)
    }
    expect(out.map((o) => o.startDay.slice(0, 7))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ])
  })

  it("yearly", () => {
    const out = expandRecurrence(
      master({
        recurrence: "FREQ=YEARLY",
        startAt: ts("2026-03-15", 9),
        endAt: ts("2026-03-15", 10),
      }),
      [],
      "2026-01-01",
      "2029-12-31"
    )
    expect(days(out)).toEqual([
      "2026-03-15",
      "2027-03-15",
      "2028-03-15",
      "2029-03-15",
    ])
  })

  it("custom — every 3 days", () => {
    const out = expandRecurrence(
      master({ recurrence: "FREQ=DAILY;INTERVAL=3" }),
      [],
      "2026-09-07",
      "2026-09-20"
    )
    expect(days(out)).toEqual([
      "2026-09-07",
      "2026-09-10",
      "2026-09-13",
      "2026-09-16",
      "2026-09-19",
    ])
  })

  it("UNTIL — no occurrences after the end date (task 8.5)", () => {
    const out = expandRecurrence(
      master({ recurrence: "FREQ=DAILY;UNTIL=20260909T235959Z" }),
      [],
      "2026-09-01",
      "2026-09-30"
    )
    expect(days(out)).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"])
  })
})

describe("expandRecurrence — exceptions (tasks 8.4 / 8.6)", () => {
  it("'cancelled' removes just that occurrence", () => {
    const ex: RecurrenceException[] = [
      {
        originalDateKey: "2026-09-08",
        action: "cancelled",
        overrides: {},
        originalStartAt: ts("2026-09-08", 9) as never,
      },
    ]
    const out = expandRecurrence(
      master({ recurrence: "FREQ=DAILY" }),
      ex,
      "2026-09-07",
      "2026-09-10"
    )
    expect(days(out)).toEqual(["2026-09-07", "2026-09-09", "2026-09-10"])
  })

  it("'modified' overrides time + title for one occurrence, others untouched", () => {
    const ex: RecurrenceException[] = [
      {
        originalDateKey: "2026-09-08",
        action: "modified",
        overrides: {
          title: "Dời sang chiều",
          startAt: ts("2026-09-08", 16) as never,
          endAt: ts("2026-09-08", 17) as never,
        },
        originalStartAt: ts("2026-09-08", 9) as never,
      },
    ]
    const out = expandRecurrence(
      master({ recurrence: "FREQ=DAILY" }),
      ex,
      "2026-09-07",
      "2026-09-09"
    )
    const modified = out.find((o) => o.occurrence?.occurrenceKey === "2026-09-08")
    expect(modified?.title).toBe("Dời sang chiều")
    expect(modified?.startAt.toMillis()).toBe(vnDayStartMs("2026-09-08") + 16 * 3_600_000)
    const untouched = out.find((o) => o.occurrence?.occurrenceKey === "2026-09-07")
    expect(untouched?.title).toBe("Chuỗi")
  })
})

describe("expandRecurrence — windowing (task 8.7)", () => {
  it("an endless daily rule fills a month two years out, no doc created", () => {
    const out = expandRecurrence(
      master({ recurrence: "FREQ=DAILY" }),
      [],
      "2028-09-01",
      "2028-09-30"
    )
    expect(out).toHaveLength(30)
    expect(out[0].startDay).toBe("2028-09-01")
    // synthetic ids, not Firestore docs
    expect(out.every((o) => o.id.includes("::"))).toBe(true)
  })
})

describe("rule <-> parts (task 8.2)", () => {
  it("round-trips weekly with weekdays + count", () => {
    const parts = {
      freq: "WEEKLY" as const,
      interval: 2,
      weekdays: [1, 3], // Mon, Wed
      monthlyMode: "date" as const,
      end: { type: "count" as const, count: 8 },
    }
    const s = partsToRRuleString(parts, "2026-09-07")
    expect(s).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=8")
    expect(rruleStringToParts(s)).toEqual(parts)
  })

  it("monthly 'weekday' mode adds BYSETPOS from the start date", () => {
    // 2026-09-07 is the first Monday of September
    const s = partsToRRuleString(
      {
        freq: "MONTHLY",
        interval: 1,
        weekdays: [],
        monthlyMode: "weekday",
        end: { type: "never" },
      },
      "2026-09-07"
    )
    expect(s).toBe("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1")
    expect(rruleStringToParts(s).monthlyMode).toBe("weekday")
  })

  it("until date survives the round trip", () => {
    const s = partsToRRuleString(
      {
        freq: "DAILY",
        interval: 1,
        weekdays: [],
        monthlyMode: "date",
        end: { type: "until", date: "2026-12-31" },
      },
      "2026-09-07"
    )
    expect(s).toContain("UNTIL=20261231T235959Z")
    expect(rruleStringToParts(s).end).toEqual({
      type: "until",
      date: "2026-12-31",
    })
  })

  it("describeRecurrence reads naturally", () => {
    expect(
      describeRecurrence({
        freq: "WEEKLY",
        interval: 1,
        weekdays: [1, 4],
        monthlyMode: "date",
        end: { type: "count", count: 10 },
      })
    ).toBe("Hàng tuần vào Thứ 2, Thứ 5, 10 lần")
  })
})

describe("previewOccurrences", () => {
  it("returns the next N occurrence starts", () => {
    const dt = vnDayStartMs("2026-09-07") + 9 * 3_600_000
    const preview = previewOccurrences("FREQ=WEEKLY;BYDAY=MO", dt, 3)
    expect(preview.map((ms) => vnDateKey(ms))).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ])
  })
})

describe("parseOccurrenceId", () => {
  it("splits a composite id", () => {
    expect(parseOccurrenceId("abc::2026-09-08")).toEqual({
      masterId: "abc",
      occurrenceKey: "2026-09-08",
    })
    expect(parseOccurrenceId("plain-id")).toBeNull()
  })
})
