"use client"

import * as React from "react"

import { subscribeToContentItems } from "@/modules/campaigns/services/contentItems.service"
import type { ContentItem } from "@/modules/campaigns/types/campaign.types"

export function useContentItems(campaignId: string) {
  const [contentItems, setContentItems] = React.useState<ContentItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const unsubscribe = subscribeToContentItems(campaignId, (items) => {
      setContentItems(items)
      setLoading(false)
    })
    return unsubscribe
  }, [campaignId])

  return { contentItems, loading }
}
