"use client"

import { CampaignDetailBody } from "@/modules/campaigns/components/CampaignDetailBody"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export function CampaignDetailDrawer({
  campaignId,
  open,
  onOpenChange,
}: {
  campaignId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-4 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Chi tiết chiến dịch</SheetTitle>
        </SheetHeader>
        {campaignId && (
          <CampaignDetailBody campaignId={campaignId} onDeleted={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  )
}
