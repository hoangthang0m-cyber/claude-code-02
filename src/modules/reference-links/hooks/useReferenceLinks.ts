"use client"

import * as React from "react"

import { useAuth } from "@/context/AuthContext"
import type { ReferenceLinkOwnerType } from "@/lib/domain"
import {
  listReferenceLinks,
  type ReferenceLinkListResult,
} from "@/modules/reference-links/services/referenceLinks.client"

// The reference links of one owner (a project or a content item), plus a
// `refresh` to re-pull after a mutation (campaign-page-reference-links group 4).
export function useReferenceLinks(
  ownerType: ReferenceLinkOwnerType,
  ownerId: string
) {
  const { user } = useAuth()
  const [data, setData] = React.useState<ReferenceLinkListResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!user || !ownerId) return
    let cancelled = false
    listReferenceLinks(ownerType, ownerId)
      .then((r) => !cancelled && setData(r))
      .catch(
        (e) =>
          !cancelled && setError(e instanceof Error ? e.message : String(e))
      )
    return () => {
      cancelled = true
    }
  }, [user, ownerType, ownerId, tick])

  return {
    links: data?.links ?? [],
    overWarnLimit: data?.over_warn_limit ?? false,
    loading: data === null && error === null,
    error,
    refresh: () => setTick((t) => t + 1),
  }
}
