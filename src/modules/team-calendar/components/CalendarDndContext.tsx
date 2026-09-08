"use client"

import * as React from "react"
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"

// Shared DnD wrapper for the Day/Week and Month grids (Mục D task 7.3). The
// 6px activation distance keeps a plain click (→ open the detail popover) from
// starting a drag.
export function CalendarDndContext({
  onMoveEnd,
  children,
}: {
  onMoveEnd: (event: DragEndEvent) => void
  children: React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )
  return (
    <DndContext sensors={sensors} onDragEnd={onMoveEnd}>
      {children}
    </DndContext>
  )
}
