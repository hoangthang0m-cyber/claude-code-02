import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { markAllNotificationsRead } from "@/modules/notifications/services/notifications.server"

export const dynamic = "force-dynamic"

// POST /api/notifications/read-all — "đánh dấu tất cả đã đọc" (SPEC §5.7 R2,
// task 7.4).
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(await markAllNotificationsRead(actor))
  } catch (error) {
    return errorResponse(error)
  }
}
