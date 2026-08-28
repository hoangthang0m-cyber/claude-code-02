import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  enterManualMetric,
  getContentMetrics,
} from "@/modules/ads-performance/services/adsMetrics.server"

export const dynamic = "force-dynamic"

// GET /api/content/[contentItemId]/ads-metrics — the current ad figures
// (latest synced, else latest manual) + full history (SPEC §5.4 R4, §6.1).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await getContentMetrics(actor, contentItemId))
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/content/[contentItemId]/ads-metrics — a manager types the ad
// figures by hand; stored as source=manual (SPEC §5.4 R4).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    const result = await enterManualMetric(
      actor,
      contentItemId,
      await readJsonBody(request)
    )
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
