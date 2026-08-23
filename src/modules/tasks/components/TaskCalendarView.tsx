"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import type { Task } from "@/modules/tasks/types/task.types"
import { cn } from "@/utils/cn"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]

const PRIORITY_DOT: Record<Task["priority"], string> = {
  low: "bg-muted-foreground",
  medium: "bg-amber-500",
  high: "bg-destructive",
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function buildMonthGrid(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1)
  const startOffset = (firstOfMonth.getDay() + 6) % 7 // Monday-first
  const gridStart = new Date(year, month, 1 - startOffset)

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + i)
    return date
  })
}

export function TaskCalendarView({
  tasks,
  onSelectTask,
}: {
  tasks: Task[]
  onSelectTask: (id: string) => void
}) {
  const [cursor, setCursor] = React.useState(() => new Date())

  const tasksByDay = React.useMemo(() => {
    const map = new Map<string, Task[]>()
    tasks.forEach((task) => {
      if (!task.dueDate) return
      const key = toDateKey(task.dueDate.toDate())
      map.set(key, [...(map.get(key) ?? []), task])
    })
    return map
  }, [tasks])

  const days = buildMonthGrid(cursor.getFullYear(), cursor.getMonth())
  const currentMonth = cursor.getMonth()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          Tháng {cursor.getMonth() + 1}/{cursor.getFullYear()}
        </p>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {WEEKDAYS.map((day) => (
          <div key={day} className="bg-muted p-2 text-center font-medium">
            {day}
          </div>
        ))}
        {days.map((date) => {
          const key = toDateKey(date)
          const dayTasks = tasksByDay.get(key) ?? []
          const isCurrentMonth = date.getMonth() === currentMonth
          return (
            <div
              key={key}
              className={cn(
                "min-h-24 bg-card p-1.5",
                !isCurrentMonth && "bg-muted/30 text-muted-foreground"
              )}
            >
              <p className="mb-1 text-right">{date.getDate()}</p>
              <div className="flex flex-col gap-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    className="flex items-center gap-1 truncate rounded bg-muted px-1 py-0.5 text-left hover:bg-accent"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority])} />
                    <span className="truncate">{task.title}</span>
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-muted-foreground">+{dayTasks.length - 3} khác</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
