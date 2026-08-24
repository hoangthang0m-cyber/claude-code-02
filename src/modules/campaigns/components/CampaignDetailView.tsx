"use client"

import { useCampaign } from "@/modules/campaigns/hooks/useCampaign"
import { useContentItems } from "@/modules/campaigns/hooks/useContentItems"
import { CampaignSummaryStats } from "@/modules/campaigns/components/CampaignSummaryStats"
import { ContentTrackingTable } from "@/modules/campaigns/components/ContentTrackingTable"
import { formatMonth } from "@/utils/date"

export function CampaignDetailView({ campaignId }: { campaignId: string }) {
  const { campaign, loading: campaignLoading, error: campaignError } = useCampaign(campaignId)
  const { contentItems, loading: contentLoading, error: contentError } = useContentItems(campaignId)

  if (campaignError) {
    return <p className="text-sm text-destructive">Lỗi tải chiến dịch: {campaignError}</p>
  }

  if (campaignLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>
  }

  if (!campaign) {
    return <p className="text-sm text-muted-foreground">Không tìm thấy chiến dịch.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        {campaign.title || formatMonth(campaign.month)}
      </h1>
      <CampaignSummaryStats contentItems={contentItems} />
      {contentError ? (
        <p className="text-sm text-destructive">Lỗi tải content: {contentError}</p>
      ) : contentLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải content...</p>
      ) : (
        <ContentTrackingTable campaignId={campaignId} contentItems={contentItems} />
      )}
    </div>
  )
}
