"use client"

import * as React from "react"

import type { MetaAdsInsightsResponse } from "@/modules/reports/types/metaAds.types"

export function useMetaAdsInsights() {
  const [data, setData] = React.useState<MetaAdsInsightsResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [loadedRefreshKey, setLoadedRefreshKey] = React.useState(refreshKey)

  if (refreshKey !== loadedRefreshKey) {
    setLoadedRefreshKey(refreshKey)
    setLoading(true)
    setFetchError(null)
  }

  React.useEffect(() => {
    let cancelled = false

    fetch("/api/meta-ads/insights")
      .then((res) => res.json())
      .then((json: MetaAdsInsightsResponse) => {
        if (cancelled) return
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("useMetaAdsInsights fetch failed", err)
        setFetchError(err instanceof Error ? err.message : "Không tải được số liệu Meta Ads.")
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return {
    records: data?.records ?? [],
    accountErrors: data?.errors ?? [],
    fetchError,
    loading,
    refresh: () => setRefreshKey((key) => key + 1),
  }
}
