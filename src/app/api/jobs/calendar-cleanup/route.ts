import { runCalendarCleanup } from "@/lib/server/calendar/calendarCleanup"
import { assertCronRequest } from "@/lib/server/cron"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/jobs/calendar-cleanup — Mục D task 13.1. Daily: hard-delete calendar
// items soft-deleted more than 30 days ago (with their exceptions), and drop
// spent `dueReminders`. Replaces the Cloud Function scheduled cleanup (spec doc
// answer #2). Guarded by CRON_SECRET.
async function run(request: Request): Promise<Response> {
  try {
    assertCronRequest(request)
    return Response.json(await runCalendarCleanup(getAdminDb()))
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = run
export const POST = run
