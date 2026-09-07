import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { deleteCurrencyRate } from "@/modules/ads-overview/services/productConfig.server"

export const dynamic = "force-dynamic"

// DELETE /api/ads-reporting/currency-rates/[rateId] — remove an FX rate (task
// 5.6). Manager only.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ rateId: string }> }
) {
  try {
    const { rateId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await deleteCurrencyRate(actor, rateId))
  } catch (error) {
    return errorResponse(error)
  }
}
