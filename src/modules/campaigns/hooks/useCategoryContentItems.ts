"use client"

import * as React from "react"
import { collectionGroup, onSnapshot } from "firebase/firestore"

import { db } from "@/firebase/config"
import type { CampaignCategorySlug } from "@/constants/campaignCategories"
import { subscribeToCampaigns } from "@/modules/campaigns/services/campaigns.service"
import type { Campaign, ContentItem } from "@/modules/campaigns/types/campaign.types"

export interface CategoryContentItem extends ContentItem {
  campaign?: Campaign
}

export function useCategoryContentItems(categoryId: CampaignCategorySlug) {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [rawItems, setRawItems] = React.useState<ContentItem[]>([])
  const [campaignsLoaded, setCampaignsLoaded] = React.useState(false)
  const [itemsLoaded, setItemsLoaded] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loadedCategoryId, setLoadedCategoryId] = React.useState(categoryId)

  if (categoryId !== loadedCategoryId) {
    setLoadedCategoryId(categoryId)
    setCampaignsLoaded(false)
  }

  React.useEffect(() => {
    return subscribeToCampaigns(
      categoryId,
      (items) => {
        setCampaigns(items)
        setCampaignsLoaded(true)
      },
      (err) => {
        console.error("subscribeToCampaigns failed", err)
        setError(err.message)
        setCampaignsLoaded(true)
      }
    )
  }, [categoryId])

  React.useEffect(() => {
    const q = collectionGroup(db, "contentItems")
    return onSnapshot(
      q,
      (snapshot) => {
        setRawItems(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as ContentItem))
        setItemsLoaded(true)
      },
      (err) => {
        console.error("collectionGroup(contentItems) failed", err)
        setError(err.message)
        setItemsLoaded(true)
      }
    )
  }, [])

  const campaignById = React.useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns])

  const items: CategoryContentItem[] = React.useMemo(
    () =>
      rawItems
        .filter((item) => campaignById.has(item.campaignId))
        .map((item) => ({ ...item, campaign: campaignById.get(item.campaignId) })),
    [rawItems, campaignById]
  )

  return { items, campaigns, loading: !campaignsLoaded || !itemsLoaded, error }
}
