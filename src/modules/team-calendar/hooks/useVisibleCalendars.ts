"use client"

import * as React from "react"
import { collection, doc, onSnapshot, query } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import {
  CALENDAR_COLLECTIONS,
  resolveVisibleCalendars,
  visibleCalendarIdSet,
  type Calendar,
  type UserCalendarPrefs,
  type VisibleCalendar,
} from "@/lib/domain/calendar"

// Merges the shared `calendars` list with this viewer's `userCalendarPrefs`
// (hide/show + colour override) — Mục D task 3.2. Two realtime reads; the merge
// itself is `resolveVisibleCalendars` (pure, unit-tested).
export function useVisibleCalendars(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false
  const { user } = useAuth()
  const [calendars, setCalendars] = React.useState<Calendar[] | null>(null)
  const [prefs, setPrefs] = React.useState<UserCalendarPrefs | null>(null)

  React.useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, CALENDAR_COLLECTIONS.calendars)),
      (snap) =>
        setCalendars(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Calendar, "id">) }))
        ),
      () => setCalendars([])
    )
  }, [user])

  React.useEffect(() => {
    if (!user) return
    const empty: UserCalendarPrefs = {
      uid: user.uid,
      hidden: [],
      colorOverrides: {},
    }
    return onSnapshot(
      doc(db, CALENDAR_COLLECTIONS.userCalendarPrefs, user.uid),
      (snap) =>
        setPrefs(
          snap.exists()
            ? { ...empty, ...(snap.data() as Partial<UserCalendarPrefs>) }
            : empty
        ),
      () => setPrefs(empty)
    )
  }, [user])

  const resolved = React.useMemo<VisibleCalendar[]>(
    () => resolveVisibleCalendars(calendars ?? [], prefs, { includeArchived }),
    [calendars, prefs, includeArchived]
  )
  const visibleIds = React.useMemo(
    () => visibleCalendarIdSet(resolved),
    [resolved]
  )

  return {
    calendars: resolved,
    visibleIds,
    prefs:
      prefs ?? { uid: user?.uid ?? "", hidden: [], colorOverrides: {} },
    loading: calendars === null || prefs === null,
  }
}
