"use client"

import { ActivityIcon, ListTodoIcon, TargetIcon } from "lucide-react"

import {
  CALENDAR_ITEM_TYPE_LABELS,
  type CalendarItemType,
} from "@/lib/domain/calendar"
import { cn } from "@/utils/cn"

const ICONS = {
  goal: TargetIcon,
  activity: ActivityIcon,
  task: ListTodoIcon,
} as const

// Type indicator on every view (Mục D task 5.6) — `Mục tiêu` / `Hoạt động` /
// `Nhiệm vụ` distinguishable without opening the detail popover.
export function TypeBadge({
  type,
  showLabel = false,
  className,
}: {
  type: CalendarItemType
  showLabel?: boolean
  className?: string
}) {
  const Icon = ICONS[type]
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1", className)}
      title={CALENDAR_ITEM_TYPE_LABELS[type]}
    >
      <Icon className="size-3.5" aria-hidden />
      {showLabel ? (
        <span>{CALENDAR_ITEM_TYPE_LABELS[type]}</span>
      ) : (
        <span className="sr-only">{CALENDAR_ITEM_TYPE_LABELS[type]}</span>
      )}
    </span>
  )
}
