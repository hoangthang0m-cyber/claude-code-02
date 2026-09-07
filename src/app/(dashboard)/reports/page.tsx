import { ReportsTabs } from "@/modules/ads-overview/components/ReportsTabs"

// The "Báo cáo" screen: the product-organised Meta ad-performance report
// (ads-overview-reporting change, manager only) alongside the content progress
// dashboard (SPEC §5.6).
export default function ReportsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <ReportsTabs />
    </div>
  )
}
