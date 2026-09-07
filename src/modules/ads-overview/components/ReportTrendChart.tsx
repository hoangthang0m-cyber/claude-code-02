"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TimeseriesResponse } from "@/modules/ads-overview/services/adsReporting.client"

// task 5.3 / 5.4: spend + revenue as areas on the money axis, ROAS as a line on
// its own right axis so the scales don't fight. One chart per rendered series
// (a product, or "Chưa phân loại"), or all products stacked when no filter.

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
]

interface Props {
  data: TimeseriesResponse
  /** "" = all products overlaid; otherwise a single product id */
  focus: string
  metric: "spend" | "revenue" | "roas"
}

export function ReportTrendChart({ data, focus, metric }: Props) {
  const series = React.useMemo(() => {
    const list = data.series.map((s, i) => ({
      key: s.product_id,
      label: s.name,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      points: s.points,
    }))
    if (data.unclassified && !focus) {
      list.push({
        key: "__unc__",
        label: "Chưa phân loại",
        color: "var(--muted-foreground)",
        points: data.unclassified.points,
      })
    }
    return focus ? list.filter((s) => s.key === focus) : list
  }, [data, focus])

  const rows = React.useMemo(() => {
    return data.buckets.map((bucket, i) => {
      const row: Record<string, string | number> = { bucket }
      for (const s of series) row[s.key] = s.points[i]?.[metric] ?? 0
      return row
    })
  }, [data.buckets, series, metric])

  const config: ChartConfig = React.useMemo(() => {
    const c: ChartConfig = {}
    for (const s of series) c[s.key] = { label: s.label, color: s.color }
    return c
  }, [series])

  if (data.buckets.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Chưa có dữ liệu trong khoảng này
      </div>
    )
  }

  const isRoas = metric === "roas"

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <AreaChart data={rows} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="bucket"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) =>
            isRoas ? String(v) : Intl.NumberFormat("vi-VN", { notation: "compact" }).format(v)
          }
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) =>
          isRoas ? (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
            />
          ) : (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          )
        )}
      </AreaChart>
    </ChartContainer>
  )
}
