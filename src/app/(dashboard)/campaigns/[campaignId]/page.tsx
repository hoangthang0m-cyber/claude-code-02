import Link from "next/link"

import { CampaignDetailBody } from "@/modules/campaigns/components/CampaignDetailBody"
import { ArrowLeftIcon } from "lucide-react"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <Link
        href="/campaigns"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Back to campaigns
      </Link>
      <CampaignDetailBody campaignId={campaignId} />
    </div>
  )
}
