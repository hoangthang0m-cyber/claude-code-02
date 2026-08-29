"use client"

import * as React from "react"
import { collection, onSnapshot, query, where } from "firebase/firestore"

import { db } from "@/firebase/config"
import { COLLECTIONS } from "@/lib/domain"
import {
  aggregateRealtimeStatus,
  didReconnect,
  nextRealtimeStatus,
  shouldRefetchOnSnapshot,
  snapshotEvent,
  type RealtimeStatus,
} from "@/lib/realtime"

export interface DashboardRealtime {
  /** increments whenever a contentItem in any watched project changed */
  changeToken: number
  status: RealtimeStatus
}

// SPEC §5.7 R3 / §6.6, task 7.6: push progress-dashboard updates. A manager's
// dashboard spans every project they manage, so we open one contentItems "room"
// listener per project. The dashboard counts — total / đang sản xuất / chờ
// duyệt / quá hạn / đã lên ads — all derive from ContentItem status + deadline,
// so a status flip in any project bumps `changeToken` within a second and the
// dashboard refetches. Ads-derived figures ride the dashboard's own poll: the
// ads sync is a ~6h cron, there is no interactive ads change to miss.
export function useDashboardRealtime(
  projectIds: readonly string[]
): DashboardRealtime {
  const [changeToken, setChangeToken] = React.useState(0)
  const [status, setStatus] = React.useState<RealtimeStatus>(() =>
    projectIds.length === 0 ? "live" : "connecting"
  )

  // stable key so the effect re-subscribes only when the set actually changes
  const key = React.useMemo(
    () => [...new Set(projectIds)].sort().join(","),
    [projectIds]
  )

  React.useEffect(() => {
    const ids = key ? key.split(",") : []
    if (ids.length === 0) return

    const perRoom = new Map<string, RealtimeStatus>(
      ids.map((id) => [id, "connecting" as RealtimeStatus])
    )
    const pending = new Set(ids)
    let overall: RealtimeStatus = "connecting"

    const recompute = () => {
      const next = aggregateRealtimeStatus([...perRoom.values()])
      if (didReconnect(overall, next)) setChangeToken((t) => t + 1)
      overall = next
      setStatus(next)
    }

    const unsubs = ids.map((pid) =>
      onSnapshot(
        query(
          collection(db, COLLECTIONS.contentItems),
          where("project_id", "==", pid)
        ),
        { includeMetadataChanges: true },
        (snap) => {
          perRoom.set(
            pid,
            nextRealtimeStatus(
              perRoom.get(pid) ?? "connecting",
              snapshotEvent(snap.metadata.fromCache)
            )
          )
          const wasFirst = pending.delete(pid)
          if (
            shouldRefetchOnSnapshot({
              first: wasFirst,
              fromCache: snap.metadata.fromCache,
              docChangeCount: snap.docChanges().length,
            })
          ) {
            setChangeToken((t) => t + 1)
          }
          recompute()
        },
        () => {
          perRoom.set(pid, "offline")
          recompute()
        }
      )
    )

    return () => {
      for (const unsub of unsubs) unsub()
    }
  }, [key])

  return { changeToken, status }
}
