import { getAuthedUser } from "@/lib/server/auth"
import { snoozeNotification } from "@/lib/server/calendar/calendarNotificationsService"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"

export const dynamic = "force-dynamic"

// POST /api/calendar-notifications/[notifId]/snooze  { minutes: 5 | 30 | 60 }
// Mục D task 10.6 — re-queue the reminder for the caller after the chosen delay
// and mark the current bell row read.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ notifId: string }> }
) {
  try {
    const { notifId } = await params
    const actor = await getAuthedUser(request)
    const body = (await readJsonBody(request)) as { minutes?: unknown }
    return Response.json(
      await snoozeNotification(
        getAdminDb(),
        actor.uid,
        notifId,
        Number(body?.minutes)
      )
    )
  } catch (error) {
    return errorResponse(error)
  }
}
