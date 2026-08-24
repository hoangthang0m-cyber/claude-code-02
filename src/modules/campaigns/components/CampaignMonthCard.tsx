import Link from "next/link"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate, formatMonth } from "@/utils/date"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"
import { ChevronRightIcon } from "lucide-react"

export function CampaignMonthCard({
  campaign,
  categorySlug,
}: {
  campaign: Campaign
  categorySlug: string
}) {
  return (
    <Link href={`/campaigns/${categorySlug}/${campaign.id}`} className="block">
      <Card className="transition-colors hover:bg-muted/40" size="sm">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{campaign.title || formatMonth(campaign.month)}</CardTitle>
            <CardDescription>
              {formatMonth(campaign.month)} · Tạo lúc {formatDate(campaign.createdAt)}
            </CardDescription>
          </div>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </CardHeader>
      </Card>
    </Link>
  )
}
