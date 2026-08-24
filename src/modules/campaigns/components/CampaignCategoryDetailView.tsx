"use client"

import type { CampaignCategory } from "@/constants/campaignCategories"
import { useCampaigns } from "@/modules/campaigns/hooks/useCampaigns"
import { CampaignMonthList } from "@/modules/campaigns/components/CampaignMonthList"
import { NewCampaignSheet } from "@/modules/campaigns/components/NewCampaignSheet"

export function CampaignCategoryDetailView({ category }: { category: CampaignCategory }) {
  const { campaigns, loading, error } = useCampaigns(category.id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{category.name}</h1>
        <NewCampaignSheet categoryId={category.id} />
      </div>
      {error ? (
        <p className="text-sm text-destructive">Lỗi tải dữ liệu: {error}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : (
        <CampaignMonthList campaigns={campaigns} categorySlug={category.slug} />
      )}
    </div>
  )
}
