"use client"

import * as React from "react"

import type { AdAccountConnectionView } from "@/lib/domain"
import { useAuth } from "@/context/AuthContext"
import {
  getPendingAdAccounts,
  listAdAccountConnections,
  type PendingAdAccount,
} from "@/modules/ads-performance/services/adAccounts.client"

// The manager's Meta Ad Account connections plus any accounts waiting to be
// picked from an in-progress OAuth grant (SPEC §5.4 R1). Client reads go through
// the server API because firestore.rules denies all access to the collection.
export function useAdAccounts() {
  const { user } = useAuth()
  const [connections, setConnections] = React.useState<
    AdAccountConnectionView[] | null
  >(null)
  const [pending, setPending] = React.useState<PendingAdAccount[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!user) return
    let cancelled = false

    const load = async () => {
      try {
        const [c, p] = await Promise.all([
          listAdAccountConnections(),
          getPendingAdAccounts(),
        ])
        if (cancelled) return
        setConnections(c.connections)
        setPending(p.accounts)
        setError(null)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Không tải được danh sách")
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user, tick])

  return {
    connections: connections ?? [],
    pending,
    loading: connections === null,
    error,
    refresh: () => setTick((t) => t + 1),
  }
}
