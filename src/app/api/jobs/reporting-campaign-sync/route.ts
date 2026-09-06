import { assertCronRequest } from "@/lib/server/cron"
import { errorResponse } from "@/lib/server/http"
import { syncCampaignSnapshots } from "@/modules/ads-overview/services/reportSync.server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET/POST /api/jobs/reporting-campaign-sync — pull Meta campaign-level Insights
// per day into adsInsightSnapshots for every connected ad account
// (ads-overview-reporting tasks 3.4 / 3.6 / 3.7). Scheduled from
// .github/workflows/scheduled-jobs.yml. Guarded by CRON_SECRET.
async function run(request: Request): Promise<Response> {
  try {
    assertCronRequest(request)
    return Response.json(await syncCampaignSnapshots())
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = run
export const POST = run
