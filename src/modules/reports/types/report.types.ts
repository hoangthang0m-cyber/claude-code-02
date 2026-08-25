import type { CampaignCategorySlug } from "@/constants/campaignCategories"
import type { Campaign, ContentItem } from "@/modules/campaigns/types/campaign.types"

export interface PerformanceRecord {
  item: ContentItem
  campaign: Campaign | null
  categoryId: CampaignCategorySlug | null
  categoryName: string
}
