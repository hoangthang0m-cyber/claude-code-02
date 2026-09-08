import type { CalendarItem } from "@/lib/domain/calendar/calendarItem"
import type { CalendarItemType } from "@/lib/domain/calendar/enums"

// The persistent calendar filters (Mục B `item-assignees` / `calendar-search-
// and-filter`; Mục D tasks 9.4 / 9.5 / 12.3). Pure matching so it is
// unit-tested; the store lives in `useCalendarFilters`.

export interface CalendarFilters {
  assigneeIds: string[] // OR — an item matches if ANY of its assignees is listed
  types: CalendarItemType[] // OR within types
  projectId: string | null
  mine: boolean // "Việc của tôi" — resolved against the signed-in uid
}

export const EMPTY_FILTERS: CalendarFilters = {
  assigneeIds: [],
  types: [],
  projectId: null,
  mine: false,
}

// The assignees an item must intersect: the explicit list, plus the current
// user when "Việc của tôi" is on (task 9.5).
function wantedAssignees(
  filters: CalendarFilters,
  currentUid: string | null
): string[] {
  const ids = new Set(filters.assigneeIds)
  if (filters.mine && currentUid) ids.add(currentUid)
  return [...ids]
}

export function itemMatchesFilters(
  item: Pick<CalendarItem, "assigneeIds" | "type" | "linkedProjectId">,
  filters: CalendarFilters,
  currentUid: string | null
): boolean {
  const assignees = wantedAssignees(filters, currentUid)
  if (assignees.length > 0) {
    if (!item.assigneeIds.some((a) => assignees.includes(a))) return false
  }
  if (filters.types.length > 0 && !filters.types.includes(item.type)) {
    return false
  }
  if (filters.projectId && item.linkedProjectId !== filters.projectId) {
    return false
  }
  return true
}

// Number of filter "chips" currently applied (task 12.4).
export function activeFilterCount(filters: CalendarFilters): number {
  return (
    (filters.mine ? 1 : 0) +
    (filters.assigneeIds.length > 0 ? 1 : 0) +
    (filters.types.length > 0 ? 1 : 0) +
    (filters.projectId ? 1 : 0)
  )
}

export function hasActiveFilters(filters: CalendarFilters): boolean {
  return activeFilterCount(filters) > 0
}
