import { assertCronRequest } from "@/lib/server/cron"
import { errorResponse } from "@/lib/server/http"
import { syncDueAdsMetrics } from "@/modules/ads-performance/services/adsSync.server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET/POST /api/jobs/ads-sync — pull Meta Insights for every content item with
// an active AdsBinding that is due, appending an AdsMetric `source=synced`
// (SPEC §5.4 R3). Vercel Cron runs it hourly (vercel.json); each item's cadence
// is decided per SPEC §6.4 / Q5. Guarded by CRON_SECRET.
async function run(request: Request): Promise<Response> {
  try {
    assertCronRequest(request)
    return Response.json(await syncDueAdsMetrics())
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = run
export const POST = run
