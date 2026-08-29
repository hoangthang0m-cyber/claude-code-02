"use client"

import * as React from "react"

import { useAuth } from "@/context/AuthContext"
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationList,
} from "@/modules/notifications/services/notifications.client"

const POLL_MS = 30_000

const EMPTY: NotificationList = { unread_count: 0, items: [] }

// SPEC §5.7 R2 / §6.6, task 7.4: the notification bell's data — polled every
// 30s (a channel separate from realtime). Mark-read is applied optimistically
// and reconciled on the next poll (or an immediate refresh on failure).
export function useNotifications() {
  const { user } = useAuth()
  const [data, setData] = React.useState<NotificationList>(EMPTY)
  const [loading, setLoading] = React.useState(true)
  const [tick, setTick] = React.useState(0)

  const refresh = React.useCallback(() => setTick((t) => t + 1), [])

  React.useEffect(() => {
    if (!user) return
    let cancelled = false

    const load = async () => {
      try {
        const next = await getNotifications()
        if (!cancelled) setData(next)
      } catch {
        // keep the last good snapshot; try again next tick
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user, tick])

  const markOne = React.useCallback(
    async (id: string) => {
      setData((d) => {
        const item = d.items.find((n) => n.id === id)
        if (!item || item.read_at != null) return d
        return {
          unread_count: Math.max(0, d.unread_count - 1),
          items: d.items.map((n) =>
            n.id === id ? { ...n, read_at: Date.now() } : n
          ),
        }
      })
      try {
        await markNotificationRead(id)
      } catch {
        refresh()
      }
    },
    [refresh]
  )

  const markAll = React.useCallback(async () => {
    setData((d) => ({
      unread_count: 0,
      items: d.items.map((n) => ({ ...n, read_at: n.read_at ?? Date.now() })),
    }))
    try {
      await markAllNotificationsRead()
    } catch {
      refresh()
    }
  }, [refresh])

  return {
    items: data.items,
    unreadCount: data.unread_count,
    loading,
    refresh,
    markOne,
    markAll,
  }
}
