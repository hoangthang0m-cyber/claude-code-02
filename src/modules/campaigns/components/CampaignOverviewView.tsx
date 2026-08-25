"use client"

import { useCampaignCategories } from "@/modules/campaigns/hooks/useCampaignCategories"
import { useCampaignOverviewStats } from "@/modules/campaigns/hooks/useCampaignOverviewStats"
import { CampaignCategoryCard } from "@/modules/campaigns/components/CampaignCategoryCard"

export function CampaignOverviewView() {
  const categories = useCampaignCategories()
  const { stats, error } = useCampaignOverviewStats()

  if (error) {
    return <p className="text-sm text-destructive">Lỗi tải dữ liệu: {error}</p>
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category, index) => (
        <CampaignCategoryCard
          key={category.id}
          category={category}
          stat={stats[category.id]}
          style={{ animationDelay: `${index * 60}ms` }}
        />
      ))}
    </div>
  )
}
