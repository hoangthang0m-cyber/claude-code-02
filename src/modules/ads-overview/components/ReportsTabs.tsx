"use client"

import { useAuth } from "@/context/AuthContext"
import { AnalyticsView } from "@/modules/analytics/components/AnalyticsView"
import { AdsOverviewView } from "@/modules/ads-overview/components/AdsOverviewView"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// task 5.1: the "Báo cáo" screen. The product-organised ad-performance report
// (ads-overview-reporting) is manager-only; a non-manager sees only the content
// progress dashboard.
export function ReportsTabs() {
  const { profile } = useAuth()
  const isManager = profile?.system_role === "manager"

  if (!isManager) return <AnalyticsView />

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Báo cáo</h1>
      <Tabs defaultValue="ads">
        <TabsList>
          <TabsTrigger value="ads">Hiệu quả quảng cáo</TabsTrigger>
          <TabsTrigger value="progress">Tiến độ nội dung</TabsTrigger>
        </TabsList>
        <TabsContent value="ads" className="pt-3">
          <AdsOverviewView />
        </TabsContent>
        <TabsContent value="progress" className="pt-3">
          <AnalyticsView />
        </TabsContent>
      </Tabs>
    </div>
  )
}
