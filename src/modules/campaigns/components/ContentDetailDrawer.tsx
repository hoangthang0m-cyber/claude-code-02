"use client"

import * as React from "react"
import { Timestamp } from "firebase/firestore"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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

function toDateInputValue(timestamp?: Timestamp) {
  if (!timestamp) return ""
  return timestamp.toDate().toISOString().slice(0, 10)
}

function toNumberInputValue(value?: number) {
  return value === undefined ? "" : String(value)
}

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
  const [reportDate, setReportDate] = React.useState(toDateInputValue(item?.reportDate))
  const [adSpend, setAdSpend] = React.useState(toNumberInputValue(item?.adSpend))
  const [revenue, setRevenue] = React.useState(toNumberInputValue(item?.revenue))
  const [purchases, setPurchases] = React.useState(toNumberInputValue(item?.purchases))
  const [cpp, setCpp] = React.useState(toNumberInputValue(item?.cpp))
  const [roas, setRoas] = React.useState(toNumberInputValue(item?.roas))
  const [syncedItemId, setSyncedItemId] = React.useState(item?.id)

  if (item?.id !== syncedItemId) {
    setSyncedItemId(item?.id)
    setAdsPerformanceReport(item?.adsPerformanceReport ?? "")
    setEvaluationNote(item?.evaluationNote ?? "")
    setReportDate(toDateInputValue(item?.reportDate))
    setAdSpend(toNumberInputValue(item?.adSpend))
    setRevenue(toNumberInputValue(item?.revenue))
    setPurchases(toNumberInputValue(item?.purchases))
    setCpp(toNumberInputValue(item?.cpp))
    setRoas(toNumberInputValue(item?.roas))
  }

  if (!item) return null

  function handleSave() {
    if (!item) return
    return updateContentItem(campaignId, item.id, {
      adsPerformanceReport,
      evaluationNote,
      reportDate: reportDate ? Timestamp.fromDate(new Date(reportDate)) : undefined,
      adSpend: adSpend ? Number(adSpend) : undefined,
      revenue: revenue ? Number(revenue) : undefined,
      purchases: purchases ? Number(purchases) : undefined,
      cpp: cpp ? Number(cpp) : undefined,
      roas: roas ? Number(roas) : undefined,
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{item.scriptTitle || "Content chưa đặt tên"}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          <FieldGroup>
            <p className="text-sm font-medium">Hiệu quả quảng cáo</p>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="report-date">Ngày báo cáo</FieldLabel>
                <Input
                  id="report-date"
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  onBlur={handleSave}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ad-spend">Chi phí quảng cáo (VNĐ)</FieldLabel>
                <Input
                  id="ad-spend"
                  type="number"
                  value={adSpend}
                  onChange={(e) => setAdSpend(e.target.value)}
                  onBlur={handleSave}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="revenue">Doanh thu (VNĐ)</FieldLabel>
                <Input
                  id="revenue"
                  type="number"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  onBlur={handleSave}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="purchases">Số đơn</FieldLabel>
                <Input
                  id="purchases"
                  type="number"
                  value={purchases}
                  onChange={(e) => setPurchases(e.target.value)}
                  onBlur={handleSave}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cpp">CPP (VNĐ)</FieldLabel>
                <Input
                  id="cpp"
                  type="number"
                  value={cpp}
                  onChange={(e) => setCpp(e.target.value)}
                  onBlur={handleSave}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="roas">ROAS</FieldLabel>
                <Input
                  id="roas"
                  type="number"
                  step="0.01"
                  value={roas}
                  onChange={(e) => setRoas(e.target.value)}
                  onBlur={handleSave}
                />
              </Field>
            </div>
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
