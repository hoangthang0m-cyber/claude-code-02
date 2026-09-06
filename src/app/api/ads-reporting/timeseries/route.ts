import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getReportTimeseries } from "@/modules/ads-overview/services/productReport.server"

export const dynamic = "force-dynamic"

// GET /api/ads-reporting/timeseries?period=...&bucket=day|week|month&product_id=?
// The chart series: spend / revenue / ROAS per bucket, one series per product
// (all products, or just `product_id`) plus a "Chưa phân loại" series when any
// snapshot fell there (task 4.3). Manager only.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const { searchParams } = new URL(request.url)
    return Response.json(await getReportTimeseries(actor, searchParams))
  } catch (error) {
    return errorResponse(error)
  }
}
