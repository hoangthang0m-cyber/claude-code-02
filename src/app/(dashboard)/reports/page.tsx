import { ReportsTabs } from "@/modules/ads-overview/components/ReportsTabs"

// The "Báo cáo" screen: the product-organised Meta ad-performance report
// (ads-overview-reporting change, manager only) alongside the content progress
// dashboard (SPEC §5.6).
export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
      <ReportsTabs />
    </div>
  )
}
