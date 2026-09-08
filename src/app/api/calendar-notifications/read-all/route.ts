import { getAuthedUser } from "@/lib/server/auth"
import { markAllNotificationsRead } from "@/lib/server/calendar/calendarNotifications"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"

export const dynamic = "force-dynamic"

// POST /api/calendar-notifications/read-all — "đánh dấu tất cả đã đọc" for the
// calendar bell (Mục D task 10.8). Server-owned collection, so the write goes
// through here (Mục C §6).
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(
      await markAllNotificationsRead(getAdminDb(), actor.uid)
    )
  } catch (error) {
    return errorResponse(error)
  }
}
