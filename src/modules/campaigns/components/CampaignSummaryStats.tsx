"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useUsers } from "@/hooks/useUsers"
import { CONTENT_STATUS_LABELS, CONTENT_STATUSES } from "@/constants/contentStatus"
import type { ContentItem } from "@/modules/campaigns/types/campaign.types"

const STATUS_COLORS: Record<string, string> = {
  draft: "var(--muted-foreground)",
  recording: "var(--secondary)",
  ready_to_post: "var(--primary)",
  posted_ads: "var(--destructive)",
}

const statusChartConfig = CONTENT_STATUSES.reduce((config, status) => {
  config[status] = { label: CONTENT_STATUS_LABELS[status], color: STATUS_COLORS[status] }
  return config
}, {} as ChartConfig)

const assigneeChartConfig = {
  count: { label: "Số content", color: "var(--primary)" },
} satisfies ChartConfig

export function CampaignSummaryStats({ contentItems }: { contentItems: ContentItem[] }) {
  const { users } = useUsers()

  const totalContent = contentItems.length
  const postedAdsCount = contentItems.filter((item) => item.status === "posted_ads").length
  const onTimeCount = contentItems.filter((item) => item.onDeadlineStatus === "on_time").length
  const onTimeRate = totalContent === 0 ? 0 : Math.round((onTimeCount / totalContent) * 100)

  const statusData = React.useMemo(
    () =>
      CONTENT_STATUSES.map((status) => ({
        status,
        label: CONTENT_STATUS_LABELS[status],
        count: contentItems.filter((item) => item.status === status).length,
      })).filter((entry) => entry.count > 0),
    [contentItems]
  )

  const assigneeData = React.useMemo(() => {
    const nameById = new Map(users.map((u) => [u.id, u.name]))
    const counts = new Map<string, number>()
    for (const item of contentItems) {
      const key = item.assigneeId ? (nameById.get(item.assigneeId) ?? "Khác") : "Chưa gán"
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
  }, [contentItems, users])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card size="sm" className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
          <CardHeader>
            <CardDescription>Tổng số content</CardDescription>
            <CardTitle className="text-2xl">{totalContent}</CardTitle>
          </CardHeader>
        </Card>
        <Card
          size="sm"
          className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both delay-75"
        >
          <CardHeader>
            <CardDescription>Đã lên ads</CardDescription>
            <CardTitle className="text-2xl">{postedAdsCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card
          size="sm"
          className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both delay-150"
        >
          <CardHeader>
            <CardDescription>Tỉ lệ đúng deadline</CardDescription>
            <CardTitle className="text-2xl">{onTimeRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="animate-in fade-in zoom-in-95 duration-300 fill-mode-both">
          <CardHeader>
            <CardTitle>Phân bố trạng thái</CardTitle>
            <CardDescription>Theo số lượng content</CardDescription>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              <ChartContainer config={statusChartConfig} className="mx-auto max-h-64">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie data={statusData} dataKey="count" nameKey="label" innerRadius={50} outerRadius={80}>
                    {statusData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="animate-in fade-in zoom-in-95 duration-300 fill-mode-both delay-100">
          <CardHeader>
            <CardTitle>Khối lượng công việc</CardTitle>
            <CardDescription>Số content theo nhân sự</CardDescription>
          </CardHeader>
          <CardContent>
            {assigneeData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
            ) : (
              <ChartContainer config={assigneeChartConfig} className="max-h-64 w-full">
                <BarChart data={assigneeData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
