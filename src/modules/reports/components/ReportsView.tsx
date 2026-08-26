"use client"

import * as React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { CAMPAIGN_CATEGORIES, type CampaignCategorySlug } from "@/constants/campaignCategories"
import { useContentPerformance } from "@/modules/reports/hooks/useContentPerformance"
import { MetaAdsSummarySection } from "@/modules/reports/components/MetaAdsSummarySection"
import { ReportsCategoryBreakdown } from "@/modules/reports/components/ReportsCategoryBreakdown"
import { ReportsDetailTable } from "@/modules/reports/components/ReportsDetailTable"
import { ReportsSummaryCards } from "@/modules/reports/components/ReportsSummaryCards"
import { ReportsTrendCharts } from "@/modules/reports/components/ReportsTrendCharts"
import { formatMonth } from "@/utils/date"

export function ReportsView() {
  const { records, loading, error } = useContentPerformance()
  const [categoryFilter, setCategoryFilter] = React.useState<CampaignCategorySlug | "all">("all")
  const [campaignFilter, setCampaignFilter] = React.useState<string>("all")

  const recordsInCategory = React.useMemo(
    () =>
      categoryFilter === "all"
        ? records
        : records.filter((r) => r.categoryId === categoryFilter),
    [records, categoryFilter]
  )

  const campaignsInCategory = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const r of recordsInCategory) {
      if (r.campaign) map.set(r.campaign.id, r.campaign.title || formatMonth(r.campaign.month))
    }
    return Array.from(map.entries())
  }, [recordsInCategory])

  const filteredRecords = React.useMemo(
    () =>
      campaignFilter === "all"
        ? recordsInCategory
        : recordsInCategory.filter((r) => r.campaign?.id === campaignFilter),
    [recordsInCategory, campaignFilter]
  )

  function handleCategoryChange(value: string | null) {
    setCategoryFilter((value ?? "all") as CampaignCategorySlug | "all")
    setCampaignFilter("all")
  }

  if (error) {
    return <p className="px-4 text-sm text-destructive md:px-6">Lỗi tải dữ liệu: {error}</p>
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-6 px-4 py-4 duration-300 md:px-6 md:py-6">
      <div>
        <h1 className="text-lg font-semibold">Báo cáo hiệu quả quảng cáo</h1>
      </div>

      <MetaAdsSummarySection />

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Số liệu nhập tay theo content</h2>
          <p className="text-sm text-muted-foreground">
            Do team nhập trong từng content — dùng để đối chiếu với số liệu Meta Ads ở trên.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={handleCategoryChange}>
            <SelectTrigger size="sm" className="w-48">
              <SelectValue placeholder="Nhóm chiến dịch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhóm</SelectItem>
              {CAMPAIGN_CATEGORIES.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={campaignFilter} onValueChange={(value) => setCampaignFilter(value ?? "all")}>
            <SelectTrigger size="sm" className="w-48">
              <SelectValue placeholder="Chiến dịch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả chiến dịch</SelectItem>
              {campaignsInCategory.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : (
        <>
          <ReportsSummaryCards records={filteredRecords} />
          <ReportsTrendCharts records={filteredRecords} />
          <ReportsCategoryBreakdown records={filteredRecords} />
          <ReportsDetailTable records={filteredRecords} />
        </>
      )}
    </div>
  )
}
