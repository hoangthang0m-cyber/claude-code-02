"use client"

import {
  CALENDAR_COLORS,
  calendarItemDisplayTitle,
  formatVnTime,
  type RenderableItem,
  type VisibleCalendar,
} from "@/lib/domain/calendar"
import { AssigneeChips } from "@/modules/team-calendar/components/AssigneeChips"
import { TypeBadge } from "@/modules/team-calendar/components/TypeBadge"
import { useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"
import { cn } from "@/utils/cn"

// The one item renderer used across every view (Mục D task 5.6 — type indicator
// everywhere). `compact` is the tight variant for month cells / hour blocks.
export function ItemChip({
  item,
  calendar,
  onClick,
  compact = false,
  showTime = false,
  className,
  style,
}: {
  item: RenderableItem
  calendar?: VisibleCalendar
  onClick?: () => void
  compact?: boolean
  showTime?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const { byUid } = useMembers()
  const hex =
    calendar?.effectiveHex ??
    (item.colorOverride ? CALENDAR_COLORS[item.colorOverride].hex : "#616161")

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...style, borderColor: hex }}
      className={cn(
        "flex w-full items-center gap-1 overflow-hidden rounded border-l-[3px] bg-card px-1 text-left text-xs hover:bg-accent",
        compact ? "py-0.5" : "py-1",
        className
      )}
    >
      <TypeBadge type={item.type} className="text-muted-foreground" />
      {showTime && !item.allDay && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatVnTime(item.startAt)}
        </span>
      )}
      <span className="truncate">{calendarItemDisplayTitle(item.title)}</span>
      {!compact && item.assigneeIds.length > 0 && (
        <span className="ml-auto shrink-0">
          <AssigneeChips
            assigneeIds={item.assigneeIds}
            primaryAssigneeId={item.primaryAssigneeId}
            byUid={byUid}
          />
        </span>
      )}
    </button>
  )
}
