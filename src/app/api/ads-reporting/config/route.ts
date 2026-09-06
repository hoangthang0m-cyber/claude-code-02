import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getProductConfig } from "@/modules/ads-overview/services/productConfig.server"

export const dynamic = "force-dynamic"

// GET /api/ads-reporting/config — products + account rules + campaign overrides
// + connected ad accounts, for the cấu hình sản phẩm screen (task 2.5).
// Manager only.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(await getProductConfig(actor))
  } catch (error) {
    return errorResponse(error)
  }
}
