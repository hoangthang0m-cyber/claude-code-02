"use client"

import * as React from "react"
import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"

import {
  GRID_HOUR_PX,
  canEditCalendarItem,
  type RenderableItem,
  type VisibleCalendar,
} from "@/lib/domain/calendar"
import { EventItem } from "@/modules/team-calendar/components/EventItem"
import { usePermissions } from "@/modules/team-calendar/hooks/usePermissions"
import { cn } from "@/utils/cn"

// A view item that can be dragged (task 7.3) and, in the hour grid, resized
// from either edge (task 7.5). Non-editable items (task 7.4) render as a plain
// EventItem with no drag affordance.
export function DraggableEvent({
  item,
  calendar,
  onEdit,
  onDuplicated,
  onResize,
  compact,
  showTime,
  className,
  style,
}: {
  item: RenderableItem
  calendar?: VisibleCalendar
  onEdit: (item: RenderableItem) => void
  onDuplicated?: (id: string) => void
  onResize?: (edge: "start" | "end", deltaMinutes: number) => void
  compact?: boolean
  showTime?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const { uid, isManager } = usePermissions()
  const editable =
    !!uid &&
    // dragging an occurrence of a series needs the scope dialog (task 7.8) —
    // deferred; edit / drag the master or use the detail popover instead
    !item.occurrence &&
    canEditCalendarItem(
      { createdBy: item.createdBy, assigneeIds: item.assigneeIds },
      { uid, role: isManager ? "manager" : "staff" }
    )

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id, data: { item }, disabled: !editable })

  const dragStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : undefined,
    cursor: editable ? "grab" : undefined,
    touchAction: "none",
  }

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={cn("relative", className)}
      {...(editable ? listeners : {})}
      {...(editable ? attributes : {})}
    >
      <EventItem
        item={item}
        calendar={calendar}
        onEdit={onEdit}
        onDuplicated={onDuplicated}
        compact={compact}
        showTime={showTime}
        className="h-full"
      />
      {editable && onResize && !item.allDay && (
        <>
          <ResizeHandle edge="start" onResize={(m) => onResize("start", m)} />
          <ResizeHandle edge="end" onResize={(m) => onResize("end", m)} />
        </>
      )}
    </div>
  )
}

// Manual pointer handling for the resize grips (Design §3 — "xử lý con trỏ thủ
// công cho kéo mép").
function ResizeHandle({
  edge,
  onResize,
}: {
  edge: "start" | "end"
  onResize: (deltaMinutes: number) => void
}) {
  const start = React.useRef<number | null>(null)

  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        start.current = e.clientY
      }}
      onPointerUp={(e) => {
        if (start.current == null) return
        const dyPx = e.clientY - start.current
        start.current = null
        onResize((dyPx / GRID_HOUR_PX) * 60)
      }}
      className={cn(
        "absolute inset-x-0 h-1.5 cursor-ns-resize",
        edge === "start" ? "top-0" : "bottom-0"
      )}
    />
  )
}
