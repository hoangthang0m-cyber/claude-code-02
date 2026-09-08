"use client"

import * as React from "react"

import {
  enumerateDayKeys,
  daysBetweenKeys,
  isInMonth,
  todayKey,
  yearMonths,
  type RenderableItem,
} from "@/lib/domain/calendar"
import { cn } from "@/utils/cn"

// task 6.6 — 12 mini months; days with at least one item get a dot. No item
// detail here. Clicking a day → day view.
export function YearGrid({
  anchor,
  items,
  onOpenDay,
}: {
  anchor: string
  items: RenderableItem[]
  onOpenDay: (dayKey: string) => void
}) {
  const year = Number(anchor.slice(0, 4))
  const today = todayKey()

  const activeDays = React.useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (it.dayKeys) {
        for (const d of it.dayKeys) set.add(d)
      } else {
        // long-span: mark the whole range (capped at the year)
        const from = it.startDay < `${year}-01-01` ? `${year}-01-01` : it.startDay
        const to = it.endDay > `${year}-12-31` ? `${year}-12-31` : it.endDay
        if (from <= to) {
          for (const d of enumerateDayKeys(from, daysBetweenKeys(from, to))) {
            set.add(d)
          }
        }
      }
    }
    return set
  }, [items, year])

  return (
    <div className="grid grid-cols-2 gap-4 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
      {yearMonths(year).map((m) => (
        <div key={m.monthKey}>
          <p className="mb-1 text-center text-xs font-medium">{m.label}</p>
          <div className="grid grid-cols-7 gap-0.5">
            {m.grid.map((day) => {
              const inMonth = isInMonth(day, `${m.monthKey}-01`)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className={cn(
                    "relative aspect-square rounded text-center text-[10px] hover:bg-accent",
                    !inMonth && "text-muted-foreground/30",
                    day === today && "bg-primary text-primary-foreground"
                  )}
                >
                  {Number(day.slice(8))}
                  {inMonth && activeDays.has(day) && day !== today && (
                    <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
