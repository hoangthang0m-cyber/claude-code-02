import { assertCronRequest } from "@/lib/server/cron"
import { errorResponse } from "@/lib/server/http"
import { syncAdSnapshots } from "@/modules/ads-overview/services/reportSync.server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET/POST /api/jobs/reporting-ad-sync — pull Meta ad-level Insights per day
// into adCreativeInsightSnapshots, but only for ad ids that appear in an active
// ad-level AdsBinding (ads-overview-reporting tasks 3.5 / 3.7). Scheduled from
// .github/workflows/scheduled-jobs.yml. Guarded by CRON_SECRET.
async function run(request: Request): Promise<Response> {
  try {
    assertCronRequest(request)
    return Response.json(await syncAdSnapshots())
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = run
export const POST = run
