import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { listNotifications } from "@/modules/notifications/services/notifications.server"

export const dynamic = "force-dynamic"

// GET /api/notifications?limit=30 — the recipient's recent notifications plus
// the total unread count (SPEC §5.7 R2, task 7.3). Polled every 30s by the bell.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const limitParam = new URL(request.url).searchParams.get("limit")
    return Response.json(
      await listNotifications(actor, {
        limit: limitParam ? Number(limitParam) : undefined,
      })
    )
  } catch (error) {
    return errorResponse(error)
  }
}
