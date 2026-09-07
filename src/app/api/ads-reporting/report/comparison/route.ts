import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getProductReportComparison } from "@/modules/ads-overview/services/productReport.server"

export const dynamic = "force-dynamic"

// GET /api/ads-reporting/report/comparison?period=week|month&date=YYYY-MM-DD
// Absolute + percentage change of spend / revenue / ROAS for each product and
// the total, vs the immediately-preceding period (task 4.4). Manager only.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const { searchParams } = new URL(request.url)
    return Response.json(await getProductReportComparison(actor, searchParams))
  } catch (error) {
    return errorResponse(error)
  }
}
