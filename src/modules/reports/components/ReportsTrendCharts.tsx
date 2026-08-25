"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatCompactNumber } from "@/utils/format"
import type { PerformanceRecord } from "@/modules/reports/types/report.types"

const spendRevenueConfig = {
  adSpend: { label: "Chi phí quảng cáo", color: "var(--destructive)" },
  revenue: { label: "Doanh thu", color: "var(--primary)" },
} satisfies ChartConfig

const roasConfig = {
  roas: { label: "ROAS", color: "var(--primary)" },
} satisfies ChartConfig

function toDateKey(timestamp: { toDate: () => Date }) {
  return timestamp.toDate().toISOString().slice(0, 10)
}

export function ReportsTrendCharts({ records }: { records: PerformanceRecord[] }) {
  const dailyData = React.useMemo(() => {
    const byDate = new Map<string, { adSpend: number; revenue: number }>()
    for (const { item } of records) {
      if (!item.reportDate) continue
      const key = toDateKey(item.reportDate)
      const bucket = byDate.get(key) ?? { adSpend: 0, revenue: 0 }
      bucket.adSpend += item.adSpend ?? 0
      bucket.revenue += item.revenue ?? 0
      byDate.set(key, bucket)
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date,
        adSpend: values.adSpend,
        revenue: values.revenue,
        roas: values.adSpend > 0 ? Number((values.revenue / values.adSpend).toFixed(2)) : 0,
      }))
  }, [records])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="animate-in fade-in zoom-in-95 duration-300 fill-mode-both">
        <CardHeader>
          <CardTitle>Chi phí vs Doanh thu theo thời gian</CardTitle>
          <CardDescription>Tổng hợp theo ngày báo cáo</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <ChartContainer config={spendRevenueConfig} className="max-h-72 w-full">
              <AreaChart data={dailyData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatCompactNumber(value)}
                  width={48}
                />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <Area
                  dataKey="revenue"
                  type="natural"
                  fill="var(--color-revenue)"
                  fillOpacity={0.35}
                  stroke="var(--color-revenue)"
                  stackId="a"
                />
                <Area
                  dataKey="adSpend"
                  type="natural"
                  fill="var(--color-adSpend)"
                  fillOpacity={0.25}
                  stroke="var(--color-adSpend)"
                  stackId="b"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="animate-in fade-in zoom-in-95 duration-300 fill-mode-both delay-100">
        <CardHeader>
          <CardTitle>ROAS theo thời gian</CardTitle>
          <CardDescription>Tính theo tổng chi phí/doanh thu mỗi ngày</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
          ) : (
            <ChartContainer config={roasConfig} className="max-h-72 w-full">
              <LineChart data={dailyData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Line
                  dataKey="roas"
                  type="natural"
                  stroke="var(--color-roas)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
