import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getProductReport } from "@/modules/ads-overview/services/productReport.server"

export const dynamic = "force-dynamic"

// GET /api/ads-reporting/report?period=week|month&date=YYYY-MM-DD
//   (or ?from=YYYY-MM-DD&to=YYYY-MM-DD)
// Per-product spend / revenue / ROAS + the 3-product total + the "Chưa phân
// loại" row + freshness (tasks 4.1 / 4.2 / 4.5). Manager only.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const { searchParams } = new URL(request.url)
    return Response.json(await getProductReport(actor, searchParams))
  } catch (error) {
    return errorResponse(error)
  }
}
