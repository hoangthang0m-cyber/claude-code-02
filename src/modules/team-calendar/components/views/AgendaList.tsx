"use client"

import * as React from "react"

import {
  formatVnDate,
  itemOverlapsWindow,
  vnDayStartMs,
  type RenderableItem,
  type VisibleCalendar,
} from "@/lib/domain/calendar"
import { EventItem } from "@/modules/team-calendar/components/EventItem"

// task 6.7 — items grouped by day, empty days skipped, "load more" at the end.
export function AgendaList({
  windowStartDay,
  windowEndDay,
  items,
  calendarById,
  onEditItem,
  onLoadMore,
}: {
  windowStartDay: string
  windowEndDay: string
  items: RenderableItem[]
  calendarById: Map<string, VisibleCalendar>
  onEditItem: (item: RenderableItem) => void
  onLoadMore: () => void
}) {
  const groups = React.useMemo(() => {
    const map = new Map<string, RenderableItem[]>()
    for (const it of items) {
      // a day-by-day walk of the item's span, clipped to the window
      const from = it.startDay < windowStartDay ? windowStartDay : it.startDay
      const to = it.endDay > windowEndDay ? windowEndDay : it.endDay
      for (
        let ms = vnDayStartMs(from);
        ms <= vnDayStartMs(to);
        ms += 86_400_000
      ) {
        const day = new Date(ms + 7 * 3600_000).toISOString().slice(0, 10)
        if (!itemOverlapsWindow(it, { startDay: day, endDay: day })) continue
        if (!map.has(day)) map.set(day, [])
        map.get(day)!.push(it)
      }
    }
    return [...map.entries()]
      .filter(([, v]) => v.length > 0)
      .sort(([a], [b]) => a.localeCompare(b))
  }, [items, windowStartDay, windowEndDay])

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {groups.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Không có mục nào trong khoảng này.
        </p>
      )}
      {groups.map(([day, dayItems]) => (
        <section key={day} className="mb-4">
          <h3 className="mb-1 text-sm font-medium">{formatVnDate(vnDayStartMs(day))}</h3>
          <div className="flex flex-col gap-1">
            {dayItems.map((it) => (
              <EventItem
                key={`${day}:${it.id}`}
                item={it}
                calendar={calendarById.get(it.calendarId)}
                showTime
                onEdit={onEditItem}
              />
            ))}
          </div>
        </section>
      ))}
      <button
        type="button"
        onClick={onLoadMore}
        className="mx-auto block text-sm text-primary hover:underline"
      >
        Tải thêm
      </button>
    </div>
  )
}
