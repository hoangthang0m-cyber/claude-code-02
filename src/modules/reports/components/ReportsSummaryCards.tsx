import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatRoas } from "@/utils/format"
import type { PerformanceRecord } from "@/modules/reports/types/report.types"

export function ReportsSummaryCards({ records }: { records: PerformanceRecord[] }) {
  const totalAdSpend = records.reduce((sum, r) => sum + (r.item.adSpend ?? 0), 0)
  const totalRevenue = records.reduce((sum, r) => sum + (r.item.revenue ?? 0), 0)
  const totalPurchases = records.reduce((sum, r) => sum + (r.item.purchases ?? 0), 0)
  const overallRoas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : undefined
  const avgCpp = totalPurchases > 0 ? totalAdSpend / totalPurchases : undefined

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card size="sm" className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
        <CardHeader>
          <CardDescription>Tổng chi phí quảng cáo</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(totalAdSpend)}</CardTitle>
        </CardHeader>
      </Card>
      <Card
        size="sm"
        className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both delay-75"
      >
        <CardHeader>
          <CardDescription>Tổng doanh thu</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(totalRevenue)}</CardTitle>
        </CardHeader>
      </Card>
      <Card
        size="sm"
        className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both delay-150"
      >
        <CardHeader>
          <CardDescription>ROAS tổng</CardDescription>
          <CardTitle className="text-2xl">{formatRoas(overallRoas)}</CardTitle>
        </CardHeader>
      </Card>
      <Card
        size="sm"
        className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both delay-200"
      >
        <CardHeader>
          <CardDescription>CPP trung bình</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(avgCpp)}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  )
}
