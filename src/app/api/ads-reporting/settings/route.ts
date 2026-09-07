import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { updateReportingSettings } from "@/modules/ads-overview/services/productConfig.server"

export const dynamic = "force-dynamic"

// PUT /api/ads-reporting/settings — set the reporting currency (task 5.6).
// Manager only. Body: { reporting_currency }.
export async function PUT(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(
      await updateReportingSettings(actor, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}
