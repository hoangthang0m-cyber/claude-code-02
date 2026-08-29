import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  bindAd,
  listAdsBindings,
} from "@/modules/ads-performance/services/adsBindings.server"

export const dynamic = "force-dynamic"

// GET /api/content/[contentItemId]/ads-bindings — the item's Meta ad links,
// active first (SPEC §5.4 R2). Any project member can read.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await listAdsBindings(actor, contentItemId))
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/content/[contentItemId]/ads-bindings — bind a campaign / ad set / ad
// (SPEC §5.4 R2). Manager only. Body: { ad_account_id, object_level, object_id }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    const result = await bindAd(actor, contentItemId, await readJsonBody(request))
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
