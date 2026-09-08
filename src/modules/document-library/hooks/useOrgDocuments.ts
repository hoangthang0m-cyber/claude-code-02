"use client"

import * as React from "react"

import { useAuth } from "@/context/AuthContext"
import type { OrgDocumentCategory, OrgDocumentView } from "@/lib/domain"
import { listOrgDocuments } from "@/modules/document-library/services/orgDocuments.client"

// One library's items, plus a `refresh` to re-pull after a mutation. The
// component does its own client-side search / sort (the pure
// `filterAndSortOrgDocuments` helper) so typing in the search box costs no
// request.
export function useOrgDocuments(category: OrgDocumentCategory) {
  const { user } = useAuth()
  const [items, setItems] = React.useState<OrgDocumentView[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    listOrgDocuments({ category })
      .then((r) => {
        if (cancelled) return
        setItems(r.items)
        setError(null)
      })
      .catch(
        (e) =>
          !cancelled && setError(e instanceof Error ? e.message : String(e))
      )
    return () => {
      cancelled = true
    }
  }, [user, category, tick])

  return {
    items: items ?? [],
    loading: items === null && error === null,
    error,
    refresh: () => setTick((t) => t + 1),
  }
}
