import { getAuthedUser } from "@/lib/server/auth"
import { markNotificationRead } from "@/lib/server/calendar/calendarNotifications"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"

export const dynamic = "force-dynamic"

// POST /api/calendar-notifications/[notifId]/read — mark one bell row read
// (Mục D task 10.8). Scoped to the caller's own feed.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ notifId: string }> }
) {
  try {
    const { notifId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await markNotificationRead(getAdminDb(), actor.uid, notifId)
    )
  } catch (error) {
    return errorResponse(error)
  }
}
