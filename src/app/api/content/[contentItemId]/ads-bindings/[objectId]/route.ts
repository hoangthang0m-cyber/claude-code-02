import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { unbindAd } from "@/modules/ads-performance/services/adsBindings.server"

export const dynamic = "force-dynamic"

// DELETE /api/content/[contentItemId]/ads-bindings/[objectId] — unbind a Meta ad
// object (SPEC §5.4 R2). Soft delete: the row and its AdsMetric history stay,
// the sync job stops. Manager only.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string; objectId: string }> }
) {
  try {
    const { contentItemId, objectId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await unbindAd(actor, contentItemId, objectId))
  } catch (error) {
    return errorResponse(error)
  }
}
