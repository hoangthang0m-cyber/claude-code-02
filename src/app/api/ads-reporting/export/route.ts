import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getReportExport } from "@/modules/ads-overview/services/productReport.server"

export const dynamic = "force-dynamic"

// GET /api/ads-reporting/export?format=report|timeseries&period=...
// CSV of the product report (default) or the chart data (task 4.6). Manager
// only. A UTF-8 BOM is prepended so Excel opens Vietnamese text correctly.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const { searchParams } = new URL(request.url)
    const { filename, csv } = await getReportExport(actor, searchParams)
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
