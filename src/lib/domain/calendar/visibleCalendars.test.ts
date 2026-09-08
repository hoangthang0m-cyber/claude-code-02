import { describe, expect, it } from "vitest"

import type { Calendar } from "@/lib/domain/calendar/calendar"
import { CALENDAR_COLORS } from "@/lib/domain/calendar/enums"
import {
  resolveVisibleCalendars,
  visibleCalendarIdSet,
} from "@/lib/domain/calendar/visibleCalendars"

function cal(over: Partial<Calendar> & Pick<Calendar, "id">): Calendar {
  return {
    name: over.id,
    color: "peacock",
    description: null,
    kind: "shared",
    ownerUid: null,
    writeScope: "everyone",
    defaultReminders: [],
    archived: false,
    createdAt: null as never,
    updatedAt: null as never,
    ...over,
  }
}

describe("resolveVisibleCalendars", () => {
  it("marks hidden calendars and applies the viewer's colour override", () => {
    const calendars = [
      cal({ id: "a", name: "Ads", color: "basil" }),
      cal({ id: "b", name: "Nội dung", color: "peacock" }),
    ]
    const resolved = resolveVisibleCalendars(calendars, {
      hidden: ["a"],
      colorOverrides: { b: "tomato" },
    })
    const byId = new Map(resolved.map((r) => [r.calendar.id, r]))
    expect(byId.get("a")?.hidden).toBe(true)
    expect(byId.get("a")?.effectiveColor).toBe("basil") // no override → default
    expect(byId.get("b")?.hidden).toBe(false)
    expect(byId.get("b")?.effectiveColor).toBe("tomato")
    expect(byId.get("b")?.effectiveHex).toBe(CALENDAR_COLORS.tomato.hex)
  })

  it("ignores a garbage colour override", () => {
    const resolved = resolveVisibleCalendars([cal({ id: "a", color: "sage" })], {
      hidden: [],
      colorOverrides: { a: "chartreuse" as never },
    })
    expect(resolved[0].effectiveColor).toBe("sage")
  })

  it("null prefs → nothing hidden, default colours", () => {
    const resolved = resolveVisibleCalendars([cal({ id: "a" })], null)
    expect(resolved[0].hidden).toBe(false)
    expect(resolved[0].effectiveColor).toBe("peacock")
  })

  it("hides archived unless includeArchived", () => {
    const calendars = [cal({ id: "a" }), cal({ id: "z", archived: true })]
    expect(resolveVisibleCalendars(calendars, null)).toHaveLength(1)
    expect(
      resolveVisibleCalendars(calendars, null, { includeArchived: true })
    ).toHaveLength(2)
  })

  it("orders personal calendars before shared, each alphabetical (vi)", () => {
    const calendars = [
      cal({ id: "s2", name: "Zét", kind: "shared" }),
      cal({ id: "s1", name: "Ánh", kind: "shared" }),
      cal({ id: "p1", name: "Bình", kind: "personal", ownerUid: "u2" }),
    ]
    expect(
      resolveVisibleCalendars(calendars, null).map((r) => r.calendar.id)
    ).toEqual(["p1", "s1", "s2"])
  })
})

describe("visibleCalendarIdSet", () => {
  it("is the shown, non-archived calendars", () => {
    const resolved = resolveVisibleCalendars(
      [
        cal({ id: "a" }),
        cal({ id: "b" }),
        cal({ id: "z", archived: true }),
      ],
      { hidden: ["b"], colorOverrides: {} },
      { includeArchived: true }
    )
    expect([...visibleCalendarIdSet(resolved)].sort()).toEqual(["a"])
  })
})
