import { sendDueReminders } from "@/lib/server/calendar/calendarReminders"
import { assertCronRequest } from "@/lib/server/cron"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/jobs/calendar-reminders-send — Mục D task 10.5. Every ~5 min (Mục C
// §5 asks 1 min; ~5 min is the GitHub Actions floor — spec doc answer #2):
// take every `pending` `dueReminders` whose `sendAt` has passed, write one
// in-app bell row per recipient into `calendarNotifications/{uid}/items`, and
// mark the queue row `sent`. Push (channel "push") is deferred past v1
// (answer #3) — the in-app row is always written. Guarded by CRON_SECRET.
async function run(request: Request): Promise<Response> {
  try {
    assertCronRequest(request)
    return Response.json(await sendDueReminders(getAdminDb()))
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = run
export const POST = run
