"use client"

import * as React from "react"

import { addComment, subscribeToComments } from "@/modules/campaigns/services/campaigns.service"
import type { CampaignComment } from "@/modules/campaigns/types/campaign.types"

export function useCampaignComments(campaignId: string) {
  const [comments, setComments] = React.useState<CampaignComment[]>([])

  React.useEffect(() => {
    const unsubscribe = subscribeToComments(campaignId, setComments)
    return unsubscribe
  }, [campaignId])

  async function postComment(authorId: string, content: string) {
    if (!content.trim()) return
    await addComment(campaignId, { authorId, content: content.trim() })
  }

  return { comments, postComment }
}
