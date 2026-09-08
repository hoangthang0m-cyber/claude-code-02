import { expandRecurringReminders } from "@/lib/server/calendar/calendarReminders"
import { assertCronRequest } from "@/lib/server/cron"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/jobs/calendar-reminders-expand — Mục D task 10.4. Every ~15 min:
// scan recurring masters with reminders, expand their occurrences in the next
// 36 h, and upsert `dueReminders` keyed `${itemId}_${occurrenceKey}_${offset}`
// (idempotent — a second run in the window creates no duplicates). Replaces the
// Cloud Function scheduled trigger (spec doc answer #2). Guarded by CRON_SECRET.
async function run(request: Request): Promise<Response> {
  try {
    assertCronRequest(request)
    return Response.json(await expandRecurringReminders(getAdminDb()))
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = run
export const POST = run
