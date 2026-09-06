import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { setAccountRules } from "@/modules/ads-overview/services/productConfig.server"

export const dynamic = "force-dynamic"

// PUT /api/ads-reporting/account-rules — set an ad account's whole product set
// + its default product (task 2.5). Body:
// { ad_account_id, product_ids: string[], default_product_id?: string | null }.
// Manager only; the account must already be connected.
export async function PUT(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await setAccountRules(actor, await readJsonBody(request))
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
