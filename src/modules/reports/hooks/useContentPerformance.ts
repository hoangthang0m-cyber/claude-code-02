"use client"

import * as React from "react"

import { getCampaignCategory } from "@/constants/campaignCategories"
import { subscribeToAllCampaigns } from "@/modules/campaigns/services/campaigns.service"
import type { Campaign, ContentItem } from "@/modules/campaigns/types/campaign.types"
import { subscribeToAllContentItems } from "@/modules/reports/services/performance.service"
import type { PerformanceRecord } from "@/modules/reports/types/report.types"

export function useContentPerformance() {
  const [contentItems, setContentItems] = React.useState<ContentItem[] | null>(null)
  const [campaigns, setCampaigns] = React.useState<Campaign[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    return subscribeToAllContentItems(
      setContentItems,
      (err) => {
        console.error("subscribeToAllContentItems failed", err)
        setError(err.message)
      }
    )
  }, [])

  React.useEffect(() => {
    return subscribeToAllCampaigns(setCampaigns, (err) => {
      console.error("subscribeToAllCampaigns failed", err)
      setError(err.message)
    })
  }, [])

  const records = React.useMemo<PerformanceRecord[]>(() => {
    if (!contentItems || !campaigns) return []
    const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
    return contentItems.map((item) => {
      const campaign = campaignById.get(item.campaignId) ?? null
      const category = campaign ? getCampaignCategory(campaign.categoryId) : undefined
      return {
        item,
        campaign,
        categoryId: campaign?.categoryId ?? null,
        categoryName: category?.name ?? "Không rõ nhóm",
      }
    })
  }, [contentItems, campaigns])

  return { records, loading: contentItems === null || campaigns === null, error }
}
