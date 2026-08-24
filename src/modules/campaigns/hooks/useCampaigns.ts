"use client"

import * as React from "react"

import { subscribeToCampaigns } from "@/modules/campaigns/services/campaigns.service"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"

export function useCampaigns() {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const unsubscribe = subscribeToCampaigns((items) => {
      setCampaigns(items)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return { campaigns, loading }
}
