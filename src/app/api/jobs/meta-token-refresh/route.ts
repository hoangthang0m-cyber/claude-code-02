import { assertCronRequest } from "@/lib/server/cron"
import { errorResponse } from "@/lib/server/http"
import { refreshExpiringTokens } from "@/modules/ads-performance/services/tokenRefresh.server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET/POST /api/jobs/meta-token-refresh — renew Meta long-lived tokens nearing
// expiry and mark dead ones `needs_reconnect` (SPEC §5.4 R1, §6.4). Called by
// Vercel Cron (see vercel.json) with the CRON_SECRET bearer; GET is what Cron
// sends, POST is for a manual run.
async function run(request: Request): Promise<Response> {
  try {
    assertCronRequest(request)
    return Response.json(await refreshExpiringTokens())
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = run
export const POST = run
