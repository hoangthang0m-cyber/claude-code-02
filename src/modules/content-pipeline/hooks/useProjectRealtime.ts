"use client"

import * as React from "react"
import { collection, onSnapshot, query, where } from "firebase/firestore"

import { db } from "@/firebase/config"
import { COLLECTIONS } from "@/lib/domain"
import {
  didReconnect,
  nextRealtimeStatus,
  shouldRefetchOnSnapshot,
  snapshotEvent,
  type RealtimeStatus,
} from "@/lib/realtime"

export interface ProjectRealtime {
  /** increments whenever a contentItem in this project changed on the server */
  changeToken: number
  status: RealtimeStatus
}

// SPEC §6.6 / §5.6 R3, task 7.1: subscribe to this project's realtime "room" —
// the Firestore stream for `contentItems where project_id == projectId`. We
// don't render these docs (the filtered list stays server-side, task 5.2); the
// listener is only a change signal plus a connection-health gauge. The Firebase
// SDK reconnects the stream on its own; we surface when it is down so the caller
// can fall back to polling and resync on recovery.
export function useProjectRealtime(
  projectId: string | undefined
): ProjectRealtime {
  const [changeToken, setChangeToken] = React.useState(0)
  const [status, setStatus] = React.useState<RealtimeStatus>("connecting")

  React.useEffect(() => {
    if (!projectId) return
    let first = true
    // `current` tracks the status locally so the fold stays synchronous even
    // before React commits the state update.
    let current: RealtimeStatus = "connecting"

    const apply = (event: "server" | "cache" | "error") => {
      const next = nextRealtimeStatus(current, event)
      if (didReconnect(current, next)) setChangeToken((t) => t + 1)
      current = next
      setStatus(next)
    }

    const unsub = onSnapshot(
      query(
        collection(db, COLLECTIONS.contentItems),
        where("project_id", "==", projectId)
      ),
      { includeMetadataChanges: true },
      (snap) => {
        apply(snapshotEvent(snap.metadata.fromCache))
        if (
          shouldRefetchOnSnapshot({
            first,
            fromCache: snap.metadata.fromCache,
            docChangeCount: snap.docChanges().length,
          })
        ) {
          setChangeToken((t) => t + 1)
        }
        first = false
      },
      () => apply("error")
    )

    return () => {
      unsub()
    }
  }, [projectId])

  return { changeToken, status }
}
