"use client"

import * as React from "react"
import type { FirestoreError } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import type { PartitionedViewItems, ViewWindow } from "@/lib/domain/calendar"
import { openCalendarItemsListener } from "@/modules/team-calendar/services/calendarItemsListener"

// Realtime calendar items for the current view window + visible calendars
// (Mục D task 3.3). The effect re-opens its listeners whenever the window or the
// visible set changes and `stop()`s the previous ones on cleanup;
// `recurringMasters` feeds the rrule expander in group 8. `loading` is derived
// from data being null (same shape as useProjectGroups — no setState in effect).
export function useCalendarItems(
  window: ViewWindow,
  visibleCalendarIds: string[]
) {
  const { user } = useAuth()
  const [data, setData] = React.useState<PartitionedViewItems | null>(null)
  const [error, setError] = React.useState<FirestoreError | null>(null)

  // stable primitive deps — array / object identity changes every render
  const idsKey = React.useMemo(
    () => [...visibleCalendarIds].sort().join(" "),
    [visibleCalendarIds]
  )

  React.useEffect(() => {
    if (!user) return
    const listener = openCalendarItemsListener({
      db,
      window,
      visibleCalendarIds,
      onData: (d) => {
        setData(d)
        setError(null)
      },
      onError: setError,
    })
    return () => listener.stop()
    // window + visibleCalendarIds are captured via the primitive keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, window.startDay, window.endDay, idsKey])

  return {
    items: data?.items ?? [],
    recurringMasters: data?.recurringMasters ?? [],
    loading: data === null,
    error,
  }
}
