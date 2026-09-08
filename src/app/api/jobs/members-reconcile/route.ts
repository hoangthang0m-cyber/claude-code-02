import { reconcileAllMembers } from "@/lib/server/calendar/membersSync"
import { assertCronRequest } from "@/lib/server/cron"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET/POST /api/jobs/members-reconcile — re-project every `users` doc onto
// `members/{uid}` (so a renamed / re-roled account propagates without a
// re-login) and deactivate members whose `users` doc is gone. The nightly half
// of the Team Activity Calendar member sync (Mục C §7 / spec doc answer #2),
// replacing the Cloud Function `onWrite`. Scheduled by
// .github/workflows/scheduled-jobs.yml; guarded by CRON_SECRET.
async function run(request: Request): Promise<Response> {
  try {
    assertCronRequest(request)
    return Response.json(await reconcileAllMembers(getAdminDb()))
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = run
export const POST = run
