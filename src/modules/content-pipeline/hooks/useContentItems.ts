"use client"

import * as React from "react"

import {
  listContent,
  type ContentListParams,
  type ContentListRow,
} from "@/modules/content-pipeline/services/content.client"

const POLL_MS = 12_000

// SPEC §6.6: near-real-time for the content table. Firestore onSnapshot can't be
// used here (list rule can't be proven safe), so we poll the filtered GET.
export function useContentItems(
  projectId: string | undefined,
  params: ContentListParams
) {
  const [items, setItems] = React.useState<ContentListRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

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

    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [projectId, key, tick])

  return {
    items,
    loading: items === null,
    error,
    refresh: () => setTick((t) => t + 1),
  }
}
