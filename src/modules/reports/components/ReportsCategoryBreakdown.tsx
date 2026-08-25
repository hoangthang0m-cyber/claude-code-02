"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { CAMPAIGN_CATEGORIES } from "@/constants/campaignCategories"
import { formatCompactNumber } from "@/utils/format"
import type { PerformanceRecord } from "@/modules/reports/types/report.types"

const chartConfig = {
  adSpend: { label: "Chi phí quảng cáo", color: "var(--destructive)" },
  revenue: { label: "Doanh thu", color: "var(--primary)" },
} satisfies ChartConfig

export function ReportsCategoryBreakdown({ records }: { records: PerformanceRecord[] }) {
  const data = React.useMemo(
    () =>
      CAMPAIGN_CATEGORIES.map((category) => {
        const items = records.filter((r) => r.categoryId === category.id)
        return {
          name: category.name,
          adSpend: items.reduce((sum, r) => sum + (r.item.adSpend ?? 0), 0),
          revenue: items.reduce((sum, r) => sum + (r.item.revenue ?? 0), 0),
        }
      }),
    [records]
  )

  const hasData = data.some((entry) => entry.adSpend > 0 || entry.revenue > 0)

  return (
    <Card className="animate-in fade-in zoom-in-95 duration-300 fill-mode-both">
      <CardHeader>
        <CardTitle>So sánh giữa các nhóm chiến dịch</CardTitle>
        <CardDescription>Chi phí quảng cáo và doanh thu theo nhóm</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        ) : (
          <ChartContainer config={chartConfig} className="max-h-72 w-full">
            <BarChart data={data} margin={{ left: 0, right: 10 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatCompactNumber(value)}
                width={48}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="adSpend" fill="var(--color-adSpend)" radius={4} />
              <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
