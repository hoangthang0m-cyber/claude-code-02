"use client"

import * as React from "react"

import { useAuth } from "@/context/AuthContext"
import {
  CALENDAR_VIEWS,
  stepAnchor,
  todayKey,
  type CalendarView,
} from "@/lib/domain/calendar"
import { useCalendarSettings } from "@/modules/team-calendar/context/CalendarDataProvider"
import { setLastView } from "@/modules/team-calendar/services/userCalendarPrefs.client"

const STORAGE_KEY = "tac:lastView"

function readStoredView(): CalendarView | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && (CALENDAR_VIEWS as readonly string[]).includes(v)
      ? (v as CalendarView)
      : null
  } catch {
    return null
  }
}

// View + anchor-date state for the calendar page. Remembers the last view
// (Mục D task 6.11) in localStorage for an instant restore and mirrors it to
// `userCalendarPrefs` for cross-device.
export function useCalendarView() {
  const { user } = useAuth()
  const { settings } = useCalendarSettings()

  const [view, setViewState] = React.useState<CalendarView>(
    () => readStoredView() ?? settings.defaultView
  )
  const [anchor, setAnchor] = React.useState<string>(() => todayKey())

  const setView = React.useCallback(
    (next: CalendarView) => {
      setViewState(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* private mode — localStorage is a convenience */
      }
      if (user) setLastView(user.uid, next).catch(() => undefined)
    },
    [user]
  )

  const goToday = React.useCallback(() => setAnchor(todayKey()), [])
  const step = React.useCallback(
    (direction: 1 | -1) =>
      setAnchor((a) => stepAnchor(view, a, direction)),
    [view]
  )

  return { view, setView, anchor, setAnchor, goToday, step }
}
