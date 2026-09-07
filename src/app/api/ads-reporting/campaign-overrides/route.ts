import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { setCampaignOverride } from "@/modules/ads-overview/services/productConfig.server"

export const dynamic = "force-dynamic"

// POST /api/ads-reporting/campaign-overrides — pin one campaign to a product,
// or clear the pin (task 2.5). Body:
// { ad_account_id, campaign_id, product_id: string | null }. Manager only.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await setCampaignOverride(actor, await readJsonBody(request))
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
