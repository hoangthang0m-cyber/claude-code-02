"use client"

import * as React from "react"
import { collectionGroup, onSnapshot } from "firebase/firestore"

import { db } from "@/firebase/config"
import type { CampaignCategorySlug } from "@/constants/campaignCategories"
import { subscribeToAllCampaigns } from "@/modules/campaigns/services/campaigns.service"
import type { ContentStatus } from "@/constants/contentStatus"

export interface CampaignOverviewStat {
  campaignCount: number
  contentCount: number
  postedAdsCount: number
}

const EMPTY_STAT: CampaignOverviewStat = { campaignCount: 0, contentCount: 0, postedAdsCount: 0 }

export function useCampaignOverviewStats() {
  const [campaignCategoryById, setCampaignCategoryById] = React.useState<
    Record<string, CampaignCategorySlug>
  >({})
  const [stats, setStats] = React.useState<Record<CampaignCategorySlug, CampaignOverviewStat>>(
    {} as Record<CampaignCategorySlug, CampaignOverviewStat>
  )
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    return subscribeToAllCampaigns((campaigns) => {
      const map: Record<string, CampaignCategorySlug> = {}
      const counts: Record<string, number> = {}
      for (const campaign of campaigns) {
        map[campaign.id] = campaign.categoryId
        counts[campaign.categoryId] = (counts[campaign.categoryId] ?? 0) + 1
      }
      setCampaignCategoryById(map)
      setStats((prev) => {
        const next: Record<string, CampaignOverviewStat> = { ...prev }
        for (const categoryId of Object.keys(counts)) {
          next[categoryId] = { ...(next[categoryId] ?? EMPTY_STAT), campaignCount: counts[categoryId] }
        }
        return next as Record<CampaignCategorySlug, CampaignOverviewStat>
      })
    }, (err) => {
      console.error("subscribeToAllCampaigns failed", err)
      setError(err.message)
    })
  }, [])

  React.useEffect(() => {
    const q = collectionGroup(db, "contentItems")
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const totals: Record<string, { contentCount: number; postedAdsCount: number }> = {}
      snapshot.docs.forEach((docSnap) => {
        const campaignId = docSnap.ref.parent.parent?.id
        if (!campaignId) return
        const categoryId = campaignCategoryById[campaignId]
        if (!categoryId) return
        const status = docSnap.data().status as ContentStatus | undefined
        const bucket = totals[categoryId] ?? { contentCount: 0, postedAdsCount: 0 }
        bucket.contentCount += 1
        if (status === "posted_ads") bucket.postedAdsCount += 1
        totals[categoryId] = bucket
      })
      setStats((prev) => {
        const next: Record<string, CampaignOverviewStat> = { ...prev }
        for (const categoryId of Object.keys(totals)) {
          next[categoryId] = {
            ...(next[categoryId] ?? EMPTY_STAT),
            contentCount: totals[categoryId].contentCount,
            postedAdsCount: totals[categoryId].postedAdsCount,
          }
        }
        setLoading(false)
        return next as Record<CampaignCategorySlug, CampaignOverviewStat>
      })
    }, (err) => {
      console.error("collectionGroup(contentItems) failed", err)
      setError(err.message)
      setLoading(false)
    })
    return unsubscribe
  }, [campaignCategoryById])

  return { stats, loading, error }
}
