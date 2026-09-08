"use client"

import * as React from "react"
import { collection, onSnapshot } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import {
  CALENDAR_COLLECTIONS,
  expandRecurrence,
  type CalendarItem,
  type RecurrenceException,
  type RenderableItem,
  type ViewWindow,
} from "@/lib/domain/calendar"

// Expands the recurring masters from `useCalendarItems` into virtual
// occurrences for the current window (Mục D task 8.1 / 8.7). Subscribes to each
// master's `exceptions` subcollection so "chỉ mục này" edits show live.
export function useExpandedRecurring(
  masters: CalendarItem[],
  window: ViewWindow
): RenderableItem[] {
  const { user } = useAuth()
  const [exByMaster, setExByMaster] = React.useState<
    Map<string, RecurrenceException[]>
  >(new Map())

  const masterIds = React.useMemo(
    () => masters.map((m) => m.id).sort().join(" "),
    [masters]
  )

  React.useEffect(() => {
    if (!user) return
    const ids = masterIds ? masterIds.split(" ") : []
    const unsubs = ids.map((id) =>
      onSnapshot(
        collection(db, CALENDAR_COLLECTIONS.calendarItems, id, "exceptions"),
        (snap) => {
          setExByMaster((prev) => {
            const next = new Map(prev)
            next.set(
              id,
              snap.docs.map(
                (d) =>
                  ({
                    originalDateKey: d.id,
                    ...(d.data() as Omit<RecurrenceException, "originalDateKey">),
                  }) as RecurrenceException
              )
            )
            return next
          })
        }
      )
    )
    return () => unsubs.forEach((u) => u())
  }, [user, masterIds])

  return React.useMemo(() => {
    const out: RenderableItem[] = []
    for (const m of masters) {
      out.push(
        ...expandRecurrence(
          m,
          exByMaster.get(m.id) ?? [],
          window.startDay,
          window.endDay
        )
      )
    }
    return out
  }, [masters, exByMaster, window.startDay, window.endDay])
}
