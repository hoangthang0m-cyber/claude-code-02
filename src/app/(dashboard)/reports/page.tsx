import { ChartAreaInteractive } from "@/components/data-display/ChartAreaInteractive"
import { DataTable } from "@/components/data-display/DataTable"
import { SectionCards } from "@/components/data-display/SectionCards"

import data from "./data.json"

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <SectionCards />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>
      <DataTable data={data} />
    </div>
  )
}
