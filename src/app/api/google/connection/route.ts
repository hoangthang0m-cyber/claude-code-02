import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getGoogleConnection } from "@/modules/sheets-sync/services/googleConnection.server"

export const dynamic = "force-dynamic"

// GET /api/google/connection — the caller's Google connection status (SPEC
// §6.3). Never includes the token.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(await getGoogleConnection(actor))
  } catch (error) {
    return errorResponse(error)
  }
}
