"use client"

import { PeopleSection } from "@/modules/analytics/components/PeopleSection"
import { PeriodReportPanel } from "@/modules/analytics/components/PeriodReportPanel"
import { StatCards } from "@/modules/analytics/components/StatCards"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// SPEC §5.6, task 8.6: the manager's progress dashboard + the weekly/monthly
// report screen. A non-manager sees the same layout scoped to their own work
// (§5.6 R1 bullet 3); the hard per-role limit is task 8.7.
export function AnalyticsView() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Dashboard & báo cáo</h1>
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Tổng quan</TabsTrigger>
          <TabsTrigger value="report">Báo cáo tuần/tháng</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="flex flex-col gap-5 pt-3">
          <StatCards />
          <PeopleSection />
        </TabsContent>
        <TabsContent value="report" className="pt-3">
          <PeriodReportPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
