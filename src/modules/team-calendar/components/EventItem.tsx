"use client"

import type { RenderableItem, VisibleCalendar } from "@/lib/domain/calendar"
import { ItemChip } from "@/modules/team-calendar/components/ItemChip"
import { ItemPopover } from "@/modules/team-calendar/components/ItemPopover"

// An item on a view: the visual chip wrapped in its detail popover (task 5.1).
// "Sửa" bubbles up to the page, which opens the full editor.
export function EventItem({
  item,
  calendar,
  onEdit,
  onDuplicated,
  compact,
  showTime,
  className,
  style,
}: {
  item: RenderableItem
  calendar?: VisibleCalendar
  onEdit: (item: RenderableItem) => void
  onDuplicated?: (id: string) => void
  compact?: boolean
  showTime?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <ItemPopover
      item={item}
      onEdit={onEdit}
      onDuplicated={onDuplicated}
      trigger={
        <ItemChip
          item={item}
          calendar={calendar}
          compact={compact}
          showTime={showTime}
          className={className}
          style={style}
        />
      }
    />
  )
}
