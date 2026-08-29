"use client"

import * as React from "react"

import { pollIntervalMs, type RealtimeStatus } from "@/lib/realtime"
import {
  getDashboard,
  type ProgressDashboard,
} from "@/modules/analytics/services/analytics.client"
import { useDashboardRealtime } from "@/modules/analytics/hooks/useDashboardRealtime"
import { useMyProjects } from "@/modules/project-workspace/hooks/useMyProjects"

// SPEC §5.6 R1 / §5.7 R3, task 8.6: the six stat cards, kept near-real-time by a
// listener on every project the caller manages (task 7.6). Polls as a fallback.
export function useProgressDashboard() {
  const { projects } = useMyProjects()
  const managedIds = React.useMemo(
    () =>
      (projects ?? [])
        .filter((p) => p.my_role === "manager")
        .map((p) => p.id),
    [projects]
  )
  const { changeToken, status } = useDashboardRealtime(managedIds)

  const [data, setData] = React.useState<ProgressDashboard | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const d = await getDashboard()
        if (!cancelled) {
          setData(d)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    load()
    const id = setInterval(load, pollIntervalMs(status))
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [changeToken, status])

  return {
    data,
    error,
    loading: data === null,
    realtimeStatus: status as RealtimeStatus,
  }
}
