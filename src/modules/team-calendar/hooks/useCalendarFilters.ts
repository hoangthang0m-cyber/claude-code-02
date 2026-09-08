"use client"

import * as React from "react"

import {
  EMPTY_FILTERS,
  type CalendarFilters,
  type CalendarItemType,
} from "@/lib/domain/calendar"

const SESSION_KEY = "tac:filters"

function read(): CalendarFilters {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return EMPTY_FILTERS
    return { ...EMPTY_FILTERS, ...(JSON.parse(raw) as Partial<CalendarFilters>) }
  } catch {
    return EMPTY_FILTERS
  }
}

function write(next: CalendarFilters) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
  } catch {
    /* private mode — the filter is a per-session convenience */
  }
}

// Persistent calendar filters (Mục D tasks 9.4 / 9.5 / 12.3 / 12.4). Held in
// sessionStorage so they survive view switches and time navigation within a
// session but reset on a new one.
export function useCalendarFilters() {
  const [filters, setFilters] = React.useState<CalendarFilters>(() => read())

  const update = React.useCallback((patch: Partial<CalendarFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch }
      write(next)
      return next
    })
  }, [])

  return {
    filters,
    setAssignees: (assigneeIds: string[]) => update({ assigneeIds }),
    setTypes: (types: CalendarItemType[]) => update({ types }),
    setProjectId: (projectId: string | null) => update({ projectId }),
    // "Việc của tôi" is a shortcut, not a stackable dimension — turning it on
    // clears any explicit assignee picks so the label matches what is shown.
    toggleMine: () =>
      setFilters((prev) => {
        const next: CalendarFilters = prev.mine
          ? { ...prev, mine: false }
          : { ...prev, mine: true, assigneeIds: [] }
        write(next)
        return next
      }),
    clearAll: () => {
      write(EMPTY_FILTERS)
      setFilters(EMPTY_FILTERS)
    },
  }
}
