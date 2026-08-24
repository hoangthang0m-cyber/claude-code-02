export type CampaignCategorySlug =
  | "an-menh-hoa-duyen"
  | "tu-ban-dinh-menh"
  | "hieu-menh-duong-con"

export interface CampaignCategory {
  id: CampaignCategorySlug
  slug: CampaignCategorySlug
  name: string
}

export const CAMPAIGN_CATEGORIES: CampaignCategory[] = [
  { id: "an-menh-hoa-duyen", slug: "an-menh-hoa-duyen", name: "An Mệnh Hòa Duyên" },
  { id: "tu-ban-dinh-menh", slug: "tu-ban-dinh-menh", name: "Tứ Bản Định Mệnh" },
  { id: "hieu-menh-duong-con", slug: "hieu-menh-duong-con", name: "Hiểu Mệnh Dưỡng Con" },
]

export function getCampaignCategory(slug: string): CampaignCategory | undefined {
  return CAMPAIGN_CATEGORIES.find((category) => category.slug === slug)
}
