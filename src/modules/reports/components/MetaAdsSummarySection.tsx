"use client"

import * as React from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useMetaAdsInsights } from "@/modules/reports/hooks/useMetaAdsInsights"
import { formatCompactNumber, formatCurrency, formatRoas } from "@/utils/format"
import { RefreshCwIcon } from "lucide-react"

const trendConfig = {
  spend: { label: "Chi phí quảng cáo", color: "var(--destructive)" },
  revenue: { label: "Doanh thu", color: "var(--primary)" },
} satisfies ChartConfig

const accountConfig = {
  spend: { label: "Chi phí quảng cáo", color: "var(--destructive)" },
  revenue: { label: "Doanh thu", color: "var(--primary)" },
} satisfies ChartConfig

export function MetaAdsSummarySection() {
  const { records, accountErrors, fetchError, loading, refresh } = useMetaAdsInsights()

  const totalSpend = records.reduce((sum, r) => sum + r.spend, 0)
  const totalRevenue = records.reduce((sum, r) => sum + r.revenue, 0)
  const totalPurchases = records.reduce((sum, r) => sum + r.purchases, 0)
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : undefined
  const avgCpp = totalPurchases > 0 ? totalSpend / totalPurchases : undefined

  const dailyData = React.useMemo(() => {
    const byDate = new Map<string, { spend: number; revenue: number }>()
    for (const r of records) {
      const bucket = byDate.get(r.date) ?? { spend: 0, revenue: 0 }
      bucket.spend += r.spend
      bucket.revenue += r.revenue
      byDate.set(r.date, bucket)
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))
  }, [records])

  const accountData = React.useMemo(() => {
    const byAccount = new Map<string, { label: string; spend: number; revenue: number }>()
    for (const r of records) {
      const bucket = byAccount.get(r.accountId) ?? { label: r.accountLabel, spend: 0, revenue: 0 }
      bucket.spend += r.spend
      bucket.revenue += r.revenue
      byAccount.set(r.accountId, bucket)
    }
    return Array.from(byAccount.values())
  }, [records])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Số liệu tự động từ Meta Ads</h2>
          <p className="text-sm text-muted-foreground">
            Lấy trực tiếp từ Facebook Marketing API (30 ngày gần nhất) — tách biệt với số liệu nhập tay theo content bên dưới.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCwIcon className={loading ? "animate-spin" : undefined} />
          Làm mới
        </Button>
      </div>

      {fetchError && <p className="text-sm text-destructive">Lỗi tải số liệu Meta Ads: {fetchError}</p>}

      {accountErrors.length > 0 && (
        <div className="flex flex-col gap-1">
          {accountErrors.map((err) => (
            <p key={err.accountId} className="text-xs text-destructive">
              {err.accountLabel || "Server"}: {err.message}
            </p>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải số liệu Meta Ads...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card size="sm" className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
              <CardHeader>
                <CardDescription>Chi phí quảng cáo (Meta)</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(totalSpend)}</CardTitle>
              </CardHeader>
            </Card>
            <Card
              size="sm"
              className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both delay-75"
            >
              <CardHeader>
                <CardDescription>Doanh thu (Meta)</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(totalRevenue)}</CardTitle>
              </CardHeader>
            </Card>
            <Card
              size="sm"
              className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both delay-150"
            >
              <CardHeader>
                <CardDescription>ROAS tổng (Meta)</CardDescription>
                <CardTitle className="text-2xl">{formatRoas(overallRoas)}</CardTitle>
              </CardHeader>
            </Card>
            <Card
              size="sm"
              className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both delay-200"
            >
              <CardHeader>
                <CardDescription>CPP trung bình (Meta)</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(avgCpp)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="animate-in fade-in zoom-in-95 duration-300 fill-mode-both">
              <CardHeader>
                <CardTitle>Chi phí vs Doanh thu theo ngày</CardTitle>
                <CardDescription>Tổng hợp theo ngày, gộp tất cả tài khoản</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
                ) : (
                  <ChartContainer config={trendConfig} className="max-h-72 w-full">
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
                        dataKey="spend"
                        type="natural"
                        fill="var(--color-spend)"
                        fillOpacity={0.25}
                        stroke="var(--color-spend)"
                        stackId="b"
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="animate-in fade-in zoom-in-95 duration-300 fill-mode-both delay-100">
              <CardHeader>
                <CardTitle>So sánh giữa các tài khoản quảng cáo</CardTitle>
                <CardDescription>Chi phí và doanh thu theo tài khoản</CardDescription>
              </CardHeader>
              <CardContent>
                {accountData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
                ) : (
                  <ChartContainer config={accountConfig} className="max-h-72 w-full">
                    <BarChart data={accountData} margin={{ left: 0, right: 10 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => formatCompactNumber(value)}
                        width={48}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="spend" fill="var(--color-spend)" radius={4} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {accountData.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {accountData.map((account) => (
                <Badge key={account.label} variant="outline">
                  {account.label}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
