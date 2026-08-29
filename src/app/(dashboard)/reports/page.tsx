import { AnalyticsView } from "@/modules/analytics/components/AnalyticsView"

// SPEC §5.6, task 8.6: the progress dashboard + weekly/monthly report. Replaces
// the pre-existing `/reports` screen (old Meta-token / collectionGroup version).
export default function ReportsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <AnalyticsView />
    </div>
  )
}
