import Link from "next/link"
import { notFound } from "next/navigation"

import { getCampaignCategory } from "@/constants/campaignCategories"
import { CampaignCategoryDetailView } from "@/modules/campaigns/components/CampaignCategoryDetailView"
import { ArrowLeftIcon } from "lucide-react"

export default async function CampaignCategoryPage({
  params,
}: {
  params: Promise<{ categorySlug: string }>
}) {
  const { categorySlug } = await params
  const category = getCampaignCategory(categorySlug)
  if (!category) notFound()

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <Link
        href="/campaigns"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Danh sách nhóm chiến dịch
      </Link>
      <CampaignCategoryDetailView category={category} />
    </div>
  )
}
