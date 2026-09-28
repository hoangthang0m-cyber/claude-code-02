"use client"

import { AnalyticsView } from "@/modules/analytics/components/AnalyticsView"
import { AdsOverviewView } from "@/modules/ads-overview/components/AdsOverviewView"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// task 5.1: màn hình "Báo cáo". Trước đây tab hiệu quả quảng cáo chỉ dành cho
// Trưởng phòng; theo yêu cầu người dùng (2026-09-28) mọi thành viên đăng nhập
// đều xem được. Sửa cấu hình sản phẩm thì vẫn chỉ Trưởng phòng — chặn ở
// requireReportingManager phía máy chủ và ở trang /reports/settings.
export function ReportsTabs() {
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
