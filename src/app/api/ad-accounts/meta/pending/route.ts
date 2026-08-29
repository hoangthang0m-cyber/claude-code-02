import { getAuthedUser } from "@/lib/server/auth"
import { readCookie } from "@/lib/server/cookies"
import { errorResponse } from "@/lib/server/http"
import { META_PENDING_COOKIE } from "@/lib/server/meta/oauth"
import { readPendingAccounts } from "@/modules/ads-performance/services/adAccounts.server"

export const dynamic = "force-dynamic"

// GET /api/ad-accounts/meta/pending — the picker page lists the ad accounts the
// just-granted OAuth token can reach (SPEC §5.4 R1). Empty when there is no
// pending connect in progress.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const sealed = readCookie(request, META_PENDING_COOKIE)
    if (!sealed) {
      return Response.json({ accounts: [] })
    }
    return Response.json(readPendingAccounts(actor, sealed))
  } catch (error) {
    return errorResponse(error)
  }
}
