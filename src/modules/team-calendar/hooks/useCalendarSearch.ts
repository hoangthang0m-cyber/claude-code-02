"use client"

import * as React from "react"
import {
  collection,
  getDocs,
  query,
  where,
  type Timestamp,
} from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import {
  CALENDAR_COLLECTIONS,
  itemMatchesFilters,
  searchCalendarItems,
  type CalendarFilters,
  type CalendarItem,
  type CalendarSearchHit,
} from "@/lib/domain/calendar"
import { useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"

// A search-result row carries just enough to render the list and to jump to the
// item (Mục B — "mỗi dòng ghi tiêu đề, ngày giờ, lịch con, người đảm nhận").
export interface SearchRow {
  id: string
  title: string
  startAt: Timestamp
  endAt: Timestamp
  allDay: boolean
  startDay: string
  calendarId: string
  assigneeIds: string[]
  primaryAssigneeId: string | null
  type: CalendarItem["type"]
  description: string | null
  location: string | null
  linkedProjectId: string | null
  isRecurring: boolean
}

const DEBOUNCE_MS = 250

// Mục D task 12.1 — the whole-calendar search. Non-realtime: one `getDocs` over
// every non-deleted item (Security Rules already limit reads to members; team
// scale keeps this cheap), re-run on a debounced query. Ranking + matching are
// pure (`searchCalendarItems`). `hiddenByFilter` marks hits the active view
// filters would keep off the grid (task 12.5).
export function useCalendarSearch(
  queryText: string,
  filters: CalendarFilters,
  currentUid: string | null
) {
  const { user } = useAuth()
  const { byUid } = useMembers()
  const [snapshot, setSnapshot] = React.useState<{
    rows: SearchRow[]
    fetchedAt: number
  }>({ rows: [], fetchedAt: 0 })
  const [loading, setLoading] = React.useState(false)

  const trimmed = queryText.trim()

  React.useEffect(() => {
    if (!user || trimmed.length === 0) return
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const snap = await getDocs(
          query(
            collection(db, CALENDAR_COLLECTIONS.calendarItems),
            where("deletedAt", "==", null)
          )
        )
        if (cancelled) return
        const rows: SearchRow[] = snap.docs.map((d) => {
          const x = d.data()
          return {
            id: d.id,
            title: String(x.title ?? ""),
            startAt: x.startAt as Timestamp,
            endAt: x.endAt as Timestamp,
            allDay: Boolean(x.allDay),
            startDay: String(x.startDay ?? ""),
            calendarId: String(x.calendarId ?? ""),
            assigneeIds: Array.isArray(x.assigneeIds)
              ? (x.assigneeIds as string[])
              : [],
            primaryAssigneeId: (x.primaryAssigneeId as string | null) ?? null,
            type: (x.type as CalendarItem["type"]) ?? "task",
            description: (x.description as string | null) ?? null,
            location: (x.location as string | null) ?? null,
            linkedProjectId: (x.linkedProjectId as string | null) ?? null,
            isRecurring: Boolean(x.isRecurring),
          }
        })
        setSnapshot({ rows, fetchedAt: Date.now() })
      } catch {
        if (!cancelled) setSnapshot({ rows: [], fetchedAt: Date.now() })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [user, trimmed])

  const nameById = React.useMemo(() => {
    const m = new Map<string, string>()
    byUid.forEach((member, uid) => m.set(uid, member.displayName))
    return m
  }, [byUid])

  const hits: CalendarSearchHit<SearchRow>[] = React.useMemo(
    () =>
      searchCalendarItems(
        snapshot.rows,
        trimmed,
        nameById,
        snapshot.fetchedAt,
        (row) => !itemMatchesFilters(row, filters, currentUid)
      ),
    [snapshot, trimmed, nameById, filters, currentUid]
  )

  const active = trimmed.length > 0
  return { hits, loading: active && loading, active }
}
