"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import {
  isInMonth,
  monthGridDays,
  rangeLabel,
  stepAnchor,
  todayKey,
} from "@/lib/domain/calendar"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"

const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]

// Sidebar month picker (Mục D task 6.8 — "nhảy ngày bằng mini-tháng").
export function MiniMonth({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (dayKey: string) => void
}) {
  const [cursor, setCursor] = React.useState(selected)
  const [lastSelected, setLastSelected] = React.useState(selected)
  if (selected !== lastSelected) {
    setLastSelected(selected)
    setCursor(selected)
  }

  const grid = monthGridDays(cursor)
  const today = todayKey()

  return (
    <div className="text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium">{rangeLabel("month", cursor)}</span>
        <div className="flex">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCursor((c) => stepAnchor("month", c, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCursor((c) => stepAnchor("month", c, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {grid.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            className={cn(
              "aspect-square rounded text-center hover:bg-accent",
              !isInMonth(day, cursor) && "text-muted-foreground/50",
              day === selected && "bg-primary text-primary-foreground",
              day === today && day !== selected && "font-bold text-primary"
            )}
          >
            {Number(day.slice(8))}
          </button>
        ))}
      </div>
    </div>
  )
}
