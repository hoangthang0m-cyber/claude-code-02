"use client"

import * as React from "react"

import { subscribeToCampaign } from "@/modules/campaigns/services/campaigns.service"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"

export function useCampaign(campaignId: string) {
  const [campaign, setCampaign] = React.useState<Campaign | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const unsubscribe = subscribeToCampaign(
      campaignId,
      (nextCampaign) => {
        setCampaign(nextCampaign)
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error("subscribeToCampaign failed", err)
        setError(err.message)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [campaignId])

  return { campaign, loading, error }
}
