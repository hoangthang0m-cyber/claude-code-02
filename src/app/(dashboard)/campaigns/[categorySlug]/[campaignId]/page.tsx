import Link from "next/link"
import { notFound } from "next/navigation"

import { getCampaignCategory } from "@/constants/campaignCategories"
import { CampaignDetailView } from "@/modules/campaigns/components/CampaignDetailView"
import { ArrowLeftIcon } from "lucide-react"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ categorySlug: string; campaignId: string }>
}) {
  const { categorySlug, campaignId } = await params
  const category = getCampaignCategory(categorySlug)
  if (!category) notFound()

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <Link
        href={`/campaigns/${category.slug}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        {category.name}
      </Link>
      <CampaignDetailView campaignId={campaignId} />
    </div>
  )
}
