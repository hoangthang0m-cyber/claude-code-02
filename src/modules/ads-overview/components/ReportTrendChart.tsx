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
// its own right axis so the scales don't fight. One line per product (or "Chưa
// phân loại"), or all products overlaid when no filter.

// Line colours fixed per product (design.md codes a / t / h), theme-aware so
// the "trắng" product stays visible on a light background:
//   a  An Mệnh Hòa Duyên  → đỏ
//   t  Tứ Bản Định Mệnh    → cam
//   h  Hiếu Mệnh Dưỡng Con → trắng
const PRODUCT_COLORS: Record<string, { light: string; dark: string }> = {
  a: { light: "#dc2626", dark: "#f04438" },
  t: { light: "#ea580c", dark: "#f79009" },
  h: { light: "#18181b", dark: "#fafafa" },
}
const FALLBACK_COLORS = [
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-2)",
  "var(--chart-3)",
]

interface Props {
  data: TimeseriesResponse
  /** "" = all products overlaid; otherwise a single product id */
  focus: string
  metric: "spend" | "revenue" | "roas"
}

export function ReportTrendChart({ data, focus, metric }: Props) {
  const series = React.useMemo(() => {
    let fb = 0
    const list = data.series.map((s) => ({
      key: s.product_id,
      label: s.name,
      theme: PRODUCT_COLORS[s.code] as { light: string; dark: string } | undefined,
      fallback: FALLBACK_COLORS[fb++ % FALLBACK_COLORS.length],
      points: s.points,
    }))
    if (data.unclassified && !focus) {
      list.push({
        key: "__unc__",
        label: "Chưa phân loại",
        theme: undefined,
        fallback: "var(--muted-foreground)",
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
    for (const s of series) {
      c[s.key] = s.theme
        ? { label: s.label, theme: s.theme }
        : { label: s.label, color: s.fallback }
    }
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
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              dot={false}
            />
          ) : (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={`var(--color-${s.key})`}
              fill={`var(--color-${s.key})`}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          )
        )}
      </AreaChart>
    </ChartContainer>
  )
}
