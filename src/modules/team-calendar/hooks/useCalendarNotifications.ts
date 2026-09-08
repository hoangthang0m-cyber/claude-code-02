"use client"

import * as React from "react"
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import {
  CALENDAR_COLLECTIONS,
  type CalendarNotificationKind,
} from "@/lib/domain/calendar"
import {
  markAllCalendarNotificationsRead,
  markCalendarNotificationRead,
  snoozeCalendarNotification,
} from "@/modules/team-calendar/services/calendarNotifications.client"

const FEED_LIMIT = 30

export interface BellItem {
  id: string
  kind: CalendarNotificationKind
  itemId: string
  occurrenceKey: string | null
  itemTitle: string
  message: string
  createdAtMs: number | null
  readAtMs: number | null
}

const toMs = (t: unknown): number | null => {
  const v = t as { toMillis?: () => number } | null
  return typeof v?.toMillis === "function" ? v.toMillis() : null
}

// The calendar bell feed (Mục D task 10.8). Realtime via onSnapshot on the
// caller's own `calendarNotifications/{uid}/items` — no polling, unlike the CPT
// bell. Mark-read / snooze go through the API (server-owned collection); the
// snapshot reflects the write a moment later.
export function useCalendarNotifications() {
  const { user } = useAuth()
  const [items, setItems] = React.useState<BellItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!user) return
    const q = query(
      collection(
        db,
        CALENDAR_COLLECTIONS.calendarNotifications,
        user.uid,
        CALENDAR_COLLECTIONS.calendarNotificationItems
      ),
      orderBy("createdAt", "desc"),
      limit(FEED_LIMIT)
    )
    return onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => {
            const x = d.data()
            return {
              id: d.id,
              kind: x.kind as CalendarNotificationKind,
              itemId: String(x.itemId ?? ""),
              occurrenceKey: (x.occurrenceKey as string | null) ?? null,
              itemTitle: String(x.itemTitle ?? ""),
              message: String(x.message ?? ""),
              createdAtMs: toMs(x.createdAt),
              readAtMs: toMs(x.readAt),
            }
          })
        )
        setLoading(false)
      },
      () => setLoading(false)
    )
  }, [user])

  const unreadCount = items.filter((n) => n.readAtMs == null).length

  const markOne = React.useCallback(
    (id: string) => markCalendarNotificationRead(id).catch(() => undefined),
    []
  )
  const markAll = React.useCallback(
    () => markAllCalendarNotificationsRead().catch(() => undefined),
    []
  )
  const snooze = React.useCallback(
    (id: string, minutes: number) =>
      snoozeCalendarNotification(id, minutes).catch(() => undefined),
    []
  )

  return { items, unreadCount, loading, markOne, markAll, snooze }
}
