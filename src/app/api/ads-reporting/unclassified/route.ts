import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getUnclassifiedGroup } from "@/modules/ads-overview/services/unclassifiedGroup.server"

export const dynamic = "force-dynamic"

// GET /api/ads-reporting/unclassified?period=week|month&date=YYYY-MM-DD
//   (or ?from=YYYY-MM-DD&to=YYYY-MM-DD)
// The "Chưa phân loại" row: campaign count + spend + revenue for the window
// (task 2.6). Manager only.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const { searchParams } = new URL(request.url)
    return Response.json(await getUnclassifiedGroup(actor, searchParams))
  } catch (error) {
    return errorResponse(error)
  }
}
