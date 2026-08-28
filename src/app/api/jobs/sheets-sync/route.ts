import { assertCronRequest } from "@/lib/server/cron"
import { errorResponse } from "@/lib/server/http"
import { syncAllProjectSheets } from "@/modules/sheets-sync/services/sheetSync.server"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET/POST /api/jobs/sheets-sync — two-way Google Sheets sync for every project
// with a mapping (SPEC §5.5 R2: ≤ 5 min). Vercel Cron; guarded by CRON_SECRET.
// Task 6.3 = system → sheet; 6.4 adds sheet → system.
async function run(request: Request): Promise<Response> {
  try {
    assertCronRequest(request)
    return Response.json(await syncAllProjectSheets())
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = run
export const POST = run
