import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { addCurrencyRate } from "@/modules/ads-overview/services/productConfig.server"

export const dynamic = "force-dynamic"

// POST /api/ads-reporting/currency-rates — add an FX rate (task 5.6). Manager
// only. Body: { from_currency, to_currency, rate, effective_from }.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await addCurrencyRate(actor, await readJsonBody(request))
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
