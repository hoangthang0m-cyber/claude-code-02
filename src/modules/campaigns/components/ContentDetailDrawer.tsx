"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { ProductFileUploader } from "@/modules/campaigns/components/ProductFileUploader"
import { updateContentItem } from "@/modules/campaigns/services/contentItems.service"
import type { ContentItem } from "@/modules/campaigns/types/campaign.types"

export function ContentDetailDrawer({
  campaignId,
  item,
  open,
  onOpenChange,
}: {
  campaignId: string
  item: ContentItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [adsPerformanceReport, setAdsPerformanceReport] = React.useState(
    item?.adsPerformanceReport ?? ""
  )
  const [evaluationNote, setEvaluationNote] = React.useState(item?.evaluationNote ?? "")
  const [syncedItemId, setSyncedItemId] = React.useState(item?.id)

  if (item?.id !== syncedItemId) {
    setSyncedItemId(item?.id)
    setAdsPerformanceReport(item?.adsPerformanceReport ?? "")
    setEvaluationNote(item?.evaluationNote ?? "")
  }

  if (!item) return null

  function handleSave() {
    if (!item) return
    return updateContentItem(campaignId, item.id, { adsPerformanceReport, evaluationNote })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{item.scriptTitle || "Content chưa đặt tên"}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ads-performance-report">Báo cáo hiệu quả ads</FieldLabel>
              <Textarea
                id="ads-performance-report"
                rows={6}
                value={adsPerformanceReport}
                onChange={(e) => setAdsPerformanceReport(e.target.value)}
                onBlur={handleSave}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="evaluation-note">Đánh giá/Đề xuất</FieldLabel>
              <Textarea
                id="evaluation-note"
                rows={6}
                value={evaluationNote}
                onChange={(e) => setEvaluationNote(e.target.value)}
                onBlur={handleSave}
              />
            </Field>
          </FieldGroup>
          <ProductFileUploader
            campaignId={campaignId}
            contentItemId={item.id}
            productFiles={item.productFiles ?? []}
            onChange={(productFiles) => updateContentItem(campaignId, item.id, { productFiles })}
          />
        </div>
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Đóng</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
