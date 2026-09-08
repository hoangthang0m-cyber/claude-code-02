"use client"

import * as React from "react"
import { toast } from "sonner"

import { applyDragMove, applyResize, type CalendarItem } from "@/lib/domain/calendar"
import { updateCalendarItem } from "@/modules/team-calendar/services/calendarItems.client"
import { useCalendarUndo } from "@/modules/team-calendar/hooks/useCalendarUndo"

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

// Move / resize a timed item, with a "Hoàn tác" toast (Mục D tasks 7.3 / 7.5 /
// 7.6). The server enforces the edit matrix — on a 403 the realtime snapshot
// snaps the item back to its old position (task 7.4).
export function useItemDragActions() {
  const undo = useCalendarUndo()

  const patchTimes = React.useCallback(
    async (
      item: CalendarItem,
      next: { startMs: number; endMs: number },
      message: string
    ) => {
      const before = {
        startAt: iso(item.startAt.toMillis()),
        endAt: iso(item.endAt.toMillis()),
      }
      try {
        await updateCalendarItem(item.id, {
          startAt: iso(next.startMs),
          endAt: iso(next.endMs),
        })
        undo(message, () => updateCalendarItem(item.id, before))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Không lưu được")
      }
    },
    [undo]
  )

  const move = React.useCallback(
    (item: CalendarItem, delta: { deltaDays?: number; deltaMinutes?: number }) => {
      if (!delta.deltaDays && !delta.deltaMinutes) return
      return patchTimes(item, applyDragMove(item, delta), "Đã di chuyển mục")
    },
    [patchTimes]
  )

  const resize = React.useCallback(
    (item: CalendarItem, edge: "start" | "end", deltaMinutes: number) => {
      if (!deltaMinutes) return
      return patchTimes(
        item,
        applyResize(item, edge, deltaMinutes),
        "Đã đổi thời lượng"
      )
    },
    [patchTimes]
  )

  return { move, resize }
}
