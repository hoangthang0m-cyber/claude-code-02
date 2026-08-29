"use client"

import * as React from "react"

import {
  listContent,
  type ContentListParams,
  type ContentListRow,
} from "@/modules/content-pipeline/services/content.client"
import { useProjectRealtime } from "@/modules/content-pipeline/hooks/useProjectRealtime"
import {
  pollIntervalMs,
  type RealtimeStatus,
} from "@/modules/content-pipeline/services/realtime"

// SPEC §6.6 / §5.6 R3, task 7.1: near-real-time for the content table. The
// filtered/sorted list comes from the server (task 5.2), but a Firestore
// listener on this project's room (useProjectRealtime) pushes a refetch the
// moment someone else changes a row. Polling is the fallback: fast (~12s) while
// the realtime channel is down, slow while it is healthy. On reconnect the
// channel forces a resync so the table never sits on stale data silently.
export function useContentItems(
  projectId: string | undefined,
  params: ContentListParams
) {
  const [items, setItems] = React.useState<ContentListRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const { changeToken, status } = useProjectRealtime(projectId)
  const key = JSON.stringify(params)

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false

    const load = async () => {
      try {
        const { items } = await listContent(projectId, JSON.parse(key))
        if (!cancelled) {
          setItems(items)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }

    // runs on mount, on a realtime change (changeToken), and when the channel
    // status flips (resync on reconnect / re-pace the poll)
    load()
    const id = setInterval(load, pollIntervalMs(status))
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [projectId, key, tick, changeToken, status])

  return {
    items,
    loading: items === null,
    error,
    realtimeStatus: status as RealtimeStatus,
    refresh: () => setTick((t) => t + 1),
  }
}
