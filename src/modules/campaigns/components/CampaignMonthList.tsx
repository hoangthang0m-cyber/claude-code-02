import { CampaignMonthCard } from "@/modules/campaigns/components/CampaignMonthCard"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"

export function CampaignMonthList({
  campaigns,
  categorySlug,
}: {
  campaigns: Campaign[]
  categorySlug: string
}) {
  if (campaigns.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có chiến dịch nào trong nhóm này.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {campaigns.map((campaign) => (
        <CampaignMonthCard key={campaign.id} campaign={campaign} categorySlug={categorySlug} />
      ))}
    </div>
  )
}
