"use client"

import * as React from "react"

import type { DragEndEvent } from "@dnd-kit/core"

import {
  isInMonth,
  isoWeekNumber,
  itemOverlapsWindow,
  monthGridDays,
  todayKey,
  type RenderableItem,
  type VisibleCalendar,
} from "@/lib/domain/calendar"
import { CalendarDndContext } from "@/modules/team-calendar/components/CalendarDndContext"
import { DraggableEvent } from "@/modules/team-calendar/components/DraggableEvent"
import { EventItem } from "@/modules/team-calendar/components/EventItem"
import { useItemDragActions } from "@/modules/team-calendar/hooks/useItemDragActions"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/utils/cn"

const WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]
const MAX_PER_CELL = 3

// task 6.5 — 6×7 grid, Monday start, out-of-month days dimmed, overflow folded
// into "còn N mục", click an empty cell → day view.
export function MonthGrid({
  anchor,
  items,
  calendarById,
  showWeekNumbers,
  onEditItem,
  onOpenDay,
  onSlotSelect,
}: {
  anchor: string
  items: RenderableItem[]
  calendarById: Map<string, VisibleCalendar>
  showWeekNumbers: boolean
  onEditItem: (item: RenderableItem) => void
  onOpenDay: (dayKey: string) => void
  onSlotSelect: (
    startMs: number,
    endMs: number,
    allDay: boolean,
    anchorRect: DOMRect
  ) => void
}) {
  const grid = monthGridDays(anchor)
  const today = todayKey()
  const { move } = useItemDragActions()
  const gridRef = React.useRef<HTMLDivElement>(null)

  // task 7.3 (Tháng) — a drag moves the item by whole days, keeping the time.
  function handleMoveEnd(event: DragEndEvent) {
    const item = event.active.data.current?.item as RenderableItem | undefined
    const rect = gridRef.current?.getBoundingClientRect()
    if (!item || !rect) return
    const cellW = rect.width / 7
    const rowH = rect.height / 6
    const deltaDays =
      Math.round(event.delta.x / cellW) + Math.round(event.delta.y / rowH) * 7
    void move(item, { deltaDays })
  }

  const byDay = React.useMemo(() => {
    const map = new Map<string, RenderableItem[]>()
    for (const day of grid) {
      map.set(
        day,
        items
          .filter((it) => itemOverlapsWindow(it, { startDay: day, endDay: day }))
          .sort((a, b) => a.startDay.localeCompare(b.startDay))
      )
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, items])

  const cols = showWeekNumbers ? "grid-cols-[2rem_repeat(7,1fr)]" : "grid-cols-7"

  return (
    <CalendarDndContext onMoveEnd={handleMoveEnd}>
    <div className="flex h-full flex-col">
      <div className={cn("grid border-b text-center text-xs text-muted-foreground", cols)}>
        {showWeekNumbers && <span />}
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div ref={gridRef} className={cn("grid flex-1 auto-rows-fr", cols)}>
        {Array.from({ length: 6 }, (_, row) => {
          const weekDays = grid.slice(row * 7, row * 7 + 7)
          return (
            <React.Fragment key={row}>
              {showWeekNumbers && (
                <span className="border-t border-r py-1 text-center text-[10px] text-muted-foreground">
                  {isoWeekNumber(weekDays[0])}
                </span>
              )}
              {weekDays.map((day) => {
                const dayItems = byDay.get(day) ?? []
                const overflow = dayItems.length - MAX_PER_CELL
                return (
                  <div
                    key={day}
                    className={cn(
                      "flex min-h-24 flex-col gap-0.5 border-t border-r p-1",
                      !isInMonth(day, anchor) && "bg-muted/30"
                    )}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return
                      const midnight = Date.parse(`${day}T00:00:00+07:00`)
                      onSlotSelect(
                        midnight,
                        midnight + 86_400_000,
                        true,
                        (e.target as HTMLElement).getBoundingClientRect()
                      )
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenDay(day)}
                      className={cn(
                        "self-start rounded px-1 text-xs hover:bg-accent",
                        !isInMonth(day, anchor) && "text-muted-foreground/60",
                        day === today &&
                          "bg-primary font-bold text-primary-foreground"
                      )}
                    >
                      {Number(day.slice(8))}
                    </button>
                    {dayItems.slice(0, MAX_PER_CELL).map((it) => (
                      <DraggableEvent
                        key={it.id}
                        item={it}
                        calendar={calendarById.get(it.calendarId)}
                        compact
                        showTime
                        onEdit={onEditItem}
                      />
                    ))}
                    {overflow > 0 && (
                      <Popover>
                        <PopoverTrigger
                          render={
                            <button
                              type="button"
                              className="self-start px-1 text-[11px] text-muted-foreground hover:underline"
                            />
                          }
                        >
                          còn {overflow} mục
                        </PopoverTrigger>
                        <PopoverContent className="w-60">
                          <p className="mb-1 text-xs font-medium">{day}</p>
                          <div className="flex flex-col gap-0.5">
                            {dayItems.map((it) => (
                              <EventItem
                                key={it.id}
                                item={it}
                                calendar={calendarById.get(it.calendarId)}
                                compact
                                showTime
                                onEdit={onEditItem}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                )
              })}
            </React.Fragment>
          )
        })}
      </div>
    </div>
    </CalendarDndContext>
  )
}
