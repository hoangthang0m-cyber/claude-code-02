"use client"

import * as React from "react"

import { subscribeToContentItems } from "@/modules/campaigns/services/contentItems.service"
import type { ContentItem } from "@/modules/campaigns/types/campaign.types"

export function useContentItems(campaignId: string) {
  const [contentItems, setContentItems] = React.useState<ContentItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const unsubscribe = subscribeToContentItems(
      campaignId,
      (items) => {
        setContentItems(items)
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error("subscribeToContentItems failed", err)
        setError(err.message)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [campaignId])

  return { contentItems, loading, error }
}
