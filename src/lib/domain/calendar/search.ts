import type { CalendarItem } from "@/lib/domain/calendar/calendarItem"
import { toMillis } from "@/lib/domain/calendar/dayFields"

// Mục B `calendar-search-and-filter` — "Tìm kiếm toàn lịch". Pure matching +
// ranking so it is unit-tested; the one-shot Firestore read lives in
// `useCalendarSearch`. Search covers the whole set the user may view — it
// ignores hidden calendars and the active filters (Mục B "Tương tác giữa bộ lọc
// và tìm kiếm"); the caller flags which hits the current filters would hide.

export interface CalendarSearchHit<T> {
  item: T
  /** true when the active view filters would keep this item off the calendar */
  hiddenByFilter: boolean
}

// Strip accents + lowercase so "ra mat" matches "Ra mắt" (Mục B scenario
// wording). NFD splits "ắ" into "a" + combining marks; \p{Diacritic} drops them.
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim()
}

type Searchable = Pick<
  CalendarItem,
  "title" | "description" | "location" | "assigneeIds" | "startAt"
>

// The text a query is matched against: title + description + location + the
// display names of every assignee (Mục B — "khớp trên tiêu đề, mô tả, địa điểm,
// và tên người đảm nhận").
export function itemSearchHaystack(
  item: Searchable,
  memberNameById: ReadonlyMap<string, string>
): string {
  const parts = [
    item.title,
    item.description ?? "",
    item.location ?? "",
    ...item.assigneeIds.map((id) => memberNameById.get(id) ?? ""),
  ]
  return normalizeSearchText(parts.join("  "))
}

// Every whitespace-separated token of the query must appear somewhere in the
// haystack (AND across tokens).
export function matchesSearchQuery(
  item: Searchable,
  query: string,
  memberNameById: ReadonlyMap<string, string>
): boolean {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  const haystack = itemSearchHaystack(item, memberNameById)
  return tokens.every((t) => haystack.includes(t))
}

// "theo thời gian (gần hiện tại trước)" — closest start to now first, future
// ahead of an equally-distant past.
function proximityKey(item: Searchable, nowMs: number): number {
  const delta = toMillis(item.startAt) - nowMs
  return Math.abs(delta) * 2 + (delta < 0 ? 1 : 0)
}

export function searchCalendarItems<T extends Searchable & { id: string }>(
  items: readonly T[],
  query: string,
  memberNameById: ReadonlyMap<string, string>,
  nowMs: number,
  isHiddenByFilter: (item: T) => boolean = () => false
): CalendarSearchHit<T>[] {
  if (normalizeSearchText(query).length === 0) return []
  return items
    .filter((it) => matchesSearchQuery(it, query, memberNameById))
    .sort((a, b) => proximityKey(a, nowMs) - proximityKey(b, nowMs))
    .map((item) => ({ item, hiddenByFilter: isHiddenByFilter(item) }))
}
