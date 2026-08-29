import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getProgressDashboard } from "@/modules/analytics/services/dashboard.server"

export const dynamic = "force-dynamic"

// GET /api/dashboard — the six live progress counters (SPEC §5.6 R1, task 8.1),
// scoped to the projects the caller manages (or, for non-managers, to the
// content items assigned to them).
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(await getProgressDashboard(actor))
  } catch (error) {
    return errorResponse(error)
  }
}
