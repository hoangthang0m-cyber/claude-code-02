"use client"

import * as React from "react"
import type { DragEndEvent } from "@dnd-kit/core"

import {
  GRID_HOUR_PX,
  hourLabel,
  isoWeekNumber,
  itemDayBounds,
  itemOverlapsWindow,
  minutesIntoDay,
  nowLinePercent,
  packLanes,
  snapMinutes,
  todayKey,
  WORKDAY_SCROLL_MINUTE,
  weekDays as weekDayKeys,
  type RenderableItem,
  type VisibleCalendar,
} from "@/lib/domain/calendar"
import { CalendarDndContext } from "@/modules/team-calendar/components/CalendarDndContext"
import { DraggableEvent } from "@/modules/team-calendar/components/DraggableEvent"
import { EventItem } from "@/modules/team-calendar/components/EventItem"
import { useCurrentMinute } from "@/modules/team-calendar/hooks/useCurrentMinute"
import { useItemDragActions } from "@/modules/team-calendar/hooks/useItemDragActions"
import { cn } from "@/utils/cn"

const HOUR_PX = GRID_HOUR_PX
const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]

function dayMidnightMs(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00+07:00`)
}

// tasks 6.2 / 6.3 / 6.4 (grid, lanes, now-line) + 7.2 (drag to create) + 7.3 /
// 7.5 (drag move / edge resize).
export function DayWeekGrid({
  view,
  anchor,
  items,
  calendarById,
  showWeekNumbers,
  onEditItem,
  onSlotSelect,
}: {
  view: "day" | "week"
  anchor: string
  items: RenderableItem[]
  calendarById: Map<string, VisibleCalendar>
  showWeekNumbers: boolean
  onEditItem: (item: RenderableItem) => void
  onSlotSelect: (
    startMs: number,
    endMs: number,
    allDay: boolean,
    anchorRect: DOMRect
  ) => void
}) {
  const now = useCurrentMinute()
  const days = view === "day" ? [anchor] : weekDayKeys(anchor)
  const today = todayKey()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const columnsRef = React.useRef<HTMLDivElement>(null)
  const { move, resize } = useItemDragActions()
  const [drag, setDrag] = React.useState<{
    day: string
    fromMin: number
    toMin: number
  } | null>(null)

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (WORKDAY_SCROLL_MINUTE / 60) * HOUR_PX
    }
  }, [])

  function handleMoveEnd(event: DragEndEvent) {
    const item = event.active.data.current?.item as RenderableItem | undefined
    if (!item) return
    const deltaMinutes = (event.delta.y / HOUR_PX) * 60
    const colW =
      (columnsRef.current?.getBoundingClientRect().width ?? 0) / days.length
    const deltaDays = colW ? Math.round(event.delta.x / colW) : 0
    void move(item, { deltaDays, deltaMinutes })
  }

  const allDayByDay = new Map<string, RenderableItem[]>()
  const timedByDay = new Map<string, RenderableItem[]>()
  for (const day of days) {
    const win = { startDay: day, endDay: day }
    const dayItems = items.filter((it) => itemOverlapsWindow(it, win))
    allDayByDay.set(day, dayItems.filter((it) => it.allDay || it.spanDays > 1))
    timedByDay.set(day, dayItems.filter((it) => !it.allDay && it.spanDays === 1))
  }

  return (
    <CalendarDndContext onMoveEnd={handleMoveEnd}>
      <div className="flex h-full flex-col">
        {/* header + all-day row */}
        <div
          className="grid border-b"
          style={{
            gridTemplateColumns: `${showWeekNumbers ? "2rem " : ""}3rem repeat(${days.length}, 1fr)`,
          }}
        >
          {showWeekNumbers && (
            <span className="flex items-center justify-center text-[10px] text-muted-foreground">
              T{isoWeekNumber(days[0])}
            </span>
          )}
          <span />
          {days.map((day, i) => (
            <div key={day} className="border-l px-1 py-1 text-center text-xs">
              <span className="text-muted-foreground">{DAY_LABELS[i % 7]}</span>{" "}
              <span
                className={cn(
                  "rounded px-1",
                  day === today && "bg-primary font-bold text-primary-foreground"
                )}
              >
                {Number(day.slice(8))}
              </span>
            </div>
          ))}

          {showWeekNumbers && <span />}
          <span className="border-t py-0.5 text-center text-[10px] text-muted-foreground">
            cả ngày
          </span>
          {days.map((day) => (
            <div
              key={day}
              className="flex min-h-6 flex-col gap-0.5 border-t border-l p-0.5"
              onClick={(e) => {
                if (e.target !== e.currentTarget) return
                const rect = (e.target as HTMLElement).getBoundingClientRect()
                onSlotSelect(dayMidnightMs(day), dayMidnightMs(day) + 86_400_000, true, rect)
              }}
            >
              {(allDayByDay.get(day) ?? []).map((it) => (
                <EventItem
                  key={it.id}
                  item={it}
                  calendar={calendarById.get(it.calendarId)}
                  compact
                  onEdit={onEditItem}
                />
              ))}
            </div>
          ))}
        </div>

        {/* scrollable hour grid */}
        <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `${showWeekNumbers ? "2rem " : ""}3rem repeat(${days.length}, 1fr)`,
            }}
          >
            {showWeekNumbers && <span />}
            <div className="text-right">
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  style={{ height: HOUR_PX }}
                  className="pr-1 text-[10px] text-muted-foreground"
                >
                  {h > 0 && hourLabel(h)}
                </div>
              ))}
            </div>

            <div
              ref={columnsRef}
              className="col-span-full grid"
              style={{
                gridColumn: `${showWeekNumbers ? 3 : 2} / -1`,
                gridTemplateColumns: `repeat(${days.length}, 1fr)`,
              }}
            >
              {days.map((day) => {
                const timed = timedByDay.get(day) ?? []
                const lanes = new Map(
                  packLanes(
                    timed.map((it) => ({
                      id: it.id,
                      startMin: minutesIntoDay(it.startAt, day),
                      endMin: minutesIntoDay(it.endAt, day),
                    }))
                  ).map((l) => [l.id, l])
                )
                const nowPct = nowLinePercent(now, day)
                const dragSel =
                  drag && drag.day === day
                    ? {
                        top: Math.min(drag.fromMin, drag.toMin),
                        height: Math.abs(drag.toMin - drag.fromMin),
                      }
                    : null
                return (
                  <div
                    key={day}
                    className="relative border-l"
                    style={{ height: HOUR_PX * 24 }}
                    onPointerDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const min = snapMinutes(((e.clientY - rect.top) / HOUR_PX) * 60)
                      setDrag({ day, fromMin: min, toMin: min })
                    }}
                    onPointerMove={(e) => {
                      if (!drag || drag.day !== day) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      setDrag((d) =>
                        d
                          ? {
                              ...d,
                              toMin: snapMinutes(
                                ((e.clientY - rect.top) / HOUR_PX) * 60
                              ),
                            }
                          : d
                      )
                    }}
                    onPointerUp={(e) => {
                      if (!drag || drag.day !== day) return
                      const a = Math.min(drag.fromMin, drag.toMin)
                      const b = Math.max(drag.fromMin, drag.toMin)
                      const len = b - a || 60
                      const rect = e.currentTarget.getBoundingClientRect()
                      setDrag(null)
                      onSlotSelect(
                        dayMidnightMs(day) + a * 60_000,
                        dayMidnightMs(day) + (a + len) * 60_000,
                        false,
                        new DOMRect(rect.left, rect.top + (a / 60) * HOUR_PX, 1, 1)
                      )
                    }}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <div
                        key={h}
                        style={{ height: HOUR_PX }}
                        className="border-t border-dashed"
                      />
                    ))}
                    {dragSel && (
                      <div
                        className="pointer-events-none absolute inset-x-0.5 rounded bg-primary/20"
                        style={{
                          top: (dragSel.top / 60) * HOUR_PX,
                          height: (dragSel.height / 60) * HOUR_PX,
                        }}
                      />
                    )}
                    {timed.map((it) => {
                      const { topMin, bottomMin } = itemDayBounds(it, day)
                      const l = lanes.get(it.id) ?? { lane: 0, laneCount: 1 }
                      return (
                        <DraggableEvent
                          key={it.id}
                          item={it}
                          calendar={calendarById.get(it.calendarId)}
                          compact
                          showTime
                          onEdit={onEditItem}
                          onResize={(edge, min) => resize(it, edge, min)}
                          className="absolute px-0.5"
                          style={{
                            top: (topMin / 60) * HOUR_PX,
                            height: Math.max(
                              ((bottomMin - topMin) / 60) * HOUR_PX,
                              16
                            ),
                            left: `${(l.lane / l.laneCount) * 100}%`,
                            width: `${(1 / l.laneCount) * 100}%`,
                          }}
                        />
                      )
                    })}
                    {nowPct != null && (
                      <div
                        className="pointer-events-none absolute right-0 left-0 z-10 border-t-2 border-red-500"
                        style={{ top: `${nowPct}%` }}
                      >
                        <span className="absolute -top-1 -left-1 size-2 rounded-full bg-red-500" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </CalendarDndContext>
  )
}
