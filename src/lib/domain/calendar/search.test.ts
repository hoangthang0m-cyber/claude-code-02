import { describe, expect, it } from "vitest"

import {
  matchesSearchQuery,
  normalizeSearchText,
  searchCalendarItems,
} from "@/lib/domain/calendar/search"

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso) }) as never

const item = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "x",
  title: "",
  description: null as string | null,
  location: null as string | null,
  assigneeIds: [] as string[],
  startAt: ts("2026-09-10T09:00:00Z"),
  ...over,
})

const names = new Map([
  ["an", "Nguyễn Văn An"],
  ["binh", "Trần Bình"],
])

describe("normalizeSearchText", () => {
  it("strips Vietnamese accents and đ", () => {
    expect(normalizeSearchText("Ra mắt")).toBe("ra mat")
    expect(normalizeSearchText("Đội nội dung")).toBe("doi noi dung")
  })
})

describe("matchesSearchQuery", () => {
  it("matches the title accent-insensitively (Scenario: từ khoá trong tiêu đề)", () => {
    expect(matchesSearchQuery(item({ title: "Ra mắt sản phẩm" }), "ra mat", names)).toBe(
      true
    )
  })

  it("matches description and location too", () => {
    expect(
      matchesSearchQuery(item({ description: "Chuẩn bị kịch bản" }), "kich ban", names)
    ).toBe(true)
    expect(
      matchesSearchQuery(item({ location: "Phòng họp tầng 3" }), "tang 3", names)
    ).toBe(true)
  })

  it("matches an assignee's display name (Scenario: tìm theo tên người đảm nhận)", () => {
    expect(matchesSearchQuery(item({ assigneeIds: ["an"] }), "an", names)).toBe(true)
    expect(matchesSearchQuery(item({ assigneeIds: ["an"] }), "binh", names)).toBe(false)
  })

  it("every token must appear (AND)", () => {
    const it1 = item({ title: "Ra mắt reels tháng 9" })
    expect(matchesSearchQuery(it1, "ra mat reels", names)).toBe(true)
    expect(matchesSearchQuery(it1, "ra mat tvc", names)).toBe(false)
  })

  it("an empty query matches nothing", () => {
    expect(matchesSearchQuery(item({ title: "bất kỳ" }), "  ", names)).toBe(false)
  })
})

describe("searchCalendarItems", () => {
  const items = [
    item({ id: "past", title: "họp cũ", startAt: ts("2026-09-01T09:00:00Z") }),
    item({ id: "soon", title: "họp sắp tới", startAt: ts("2026-09-11T09:00:00Z") }),
    item({ id: "far", title: "họp xa", startAt: ts("2026-12-01T09:00:00Z") }),
    item({ id: "nomatch", title: "khác" }),
  ]
  const now = Date.parse("2026-09-10T09:00:00Z")

  it("returns matches ordered by proximity to now", () => {
    const hits = searchCalendarItems(items, "hop", names, now)
    expect(hits.map((h) => h.item.id)).toEqual(["soon", "past", "far"])
  })

  it("flags hits the active filter would hide (Scenario: kết quả ngoài bộ lọc)", () => {
    const hits = searchCalendarItems(
      items,
      "hop",
      names,
      now,
      (it) => it.id === "far"
    )
    expect(hits.find((h) => h.item.id === "far")!.hiddenByFilter).toBe(true)
    expect(hits.find((h) => h.item.id === "soon")!.hiddenByFilter).toBe(false)
  })

  it("empty query → no results", () => {
    expect(searchCalendarItems(items, "", names, now)).toHaveLength(0)
  })
})
