import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CampaignCategory } from "@/constants/campaignCategories"
import type { CampaignOverviewStat } from "@/modules/campaigns/hooks/useCampaignOverviewStats"
import { ChevronRightIcon, MegaphoneIcon } from "lucide-react"

export function CampaignCategoryCard({
  category,
  stat,
}: {
  category: CampaignCategory
  stat?: CampaignOverviewStat
}) {
  const postedAdsRate =
    !stat || stat.contentCount === 0 ? 0 : Math.round((stat.postedAdsCount / stat.contentCount) * 100)

  return (
    <Link href={`/campaigns/${category.slug}`} className="block">
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MegaphoneIcon className="size-4.5" />
            </div>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">{category.name}</CardTitle>
          <CardDescription>
            {stat?.campaignCount ?? 0} chiến dịch · {stat?.contentCount ?? 0} content
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tỉ lệ đã lên ads: <span className="font-medium text-foreground">{postedAdsRate}%</span>
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
