"use client"

import * as React from "react"

import type { CampaignCategorySlug } from "@/constants/campaignCategories"
import { subscribeToCampaigns } from "@/modules/campaigns/services/campaigns.service"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"

export function useCampaigns(categoryId: CampaignCategorySlug) {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadedCategoryId, setLoadedCategoryId] = React.useState(categoryId)

  if (categoryId !== loadedCategoryId) {
    setLoadedCategoryId(categoryId)
    setLoading(true)
  }

  React.useEffect(() => {
    const unsubscribe = subscribeToCampaigns(categoryId, (items) => {
      setCampaigns(items)
      setLoading(false)
    })
    return unsubscribe
  }, [categoryId])

  return { campaigns, loading }
}
