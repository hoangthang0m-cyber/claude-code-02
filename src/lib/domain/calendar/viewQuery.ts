import type { CalendarItem } from "@/lib/domain/calendar/calendarItem"
import {
  daysBetweenKeys,
  enumerateDayKeys,
  toMillis,
} from "@/lib/domain/calendar/dayFields"
import { DAY_KEYS_QUERY_BATCH } from "@/lib/domain/calendar/enums"

// Pure query planning + result merging for a calendar view window
// (docs/team-activity-calendar-spec.md — Mục C §2; Mục D task 3.3).
//
// Firestore forbids an inequality filter on two different fields, so a view can
// not query "items overlapping [start, end]" directly. Instead three streams
// run in parallel:
//   1. short items  — `dayKeys array-contains-any [window days]` (batched ≤ 30)
//   2. long-span    — `isLongSpan == true AND endDay >= window.startDay`
//   3. recurring    — `isRecurring == true AND startDay <= window.endDay`
// then the client merges + filters (this module).

export interface ViewWindow {
  startDay: string // "YYYY-MM-DD", giờ VN
  endDay: string // inclusive
}

export interface ViewQueryPlan {
  // one `array-contains-any` query per batch (Firestore caps that operator at 30)
  dayKeyBatches: string[][]
  window: ViewWindow
}

export function planViewQueries(window: ViewWindow): ViewQueryPlan {
  const days = enumerateDayKeys(
    window.startDay,
    daysBetweenKeys(window.startDay, window.endDay)
  )
  const dayKeyBatches: string[][] = []
  for (let i = 0; i < days.length; i += DAY_KEYS_QUERY_BATCH) {
    dayKeyBatches.push(days.slice(i, i + DAY_KEYS_QUERY_BATCH))
  }
  return { dayKeyBatches, window }
}

// [item.startDay, item.endDay] intersects [window.startDay, window.endDay].
export function itemOverlapsWindow(
  item: Pick<CalendarItem, "startDay" | "endDay">,
  window: ViewWindow
): boolean {
  return item.startDay <= window.endDay && item.endDay >= window.startDay
}

export interface PartitionedViewItems {
  // non-recurring items to render directly
  items: CalendarItem[]
  // recurring masters for the rrule expander (group 8) — not rendered as-is
  recurringMasters: CalendarItem[]
}

// Merge the raw docs from the three streams (keyed by id → deduped), drop
// soft-deleted / hidden-calendar / out-of-window docs, and split recurring
// masters out. Type / assignee filters are applied later, on top of this.
export function partitionViewItems(
  rawById: ReadonlyMap<string, CalendarItem>,
  opts: { window: ViewWindow; visibleCalendarIds: ReadonlySet<string> }
): PartitionedViewItems {
  const items: CalendarItem[] = []
  const recurringMasters: CalendarItem[] = []

  for (const item of rawById.values()) {
    if (item.deletedAt) continue
    if (!opts.visibleCalendarIds.has(item.calendarId)) continue

    if (item.isRecurring) {
      if (item.startDay <= opts.window.endDay) recurringMasters.push(item)
      continue
    }
    if (itemOverlapsWindow(item, opts.window)) items.push(item)
  }

  items.sort(byStartAt)
  recurringMasters.sort(byStartAt)
  return { items, recurringMasters }
}

function byStartAt(a: CalendarItem, b: CalendarItem): number {
  return toMillis(a.startAt) - toMillis(b.startAt)
}
