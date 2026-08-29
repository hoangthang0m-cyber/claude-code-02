import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { markNotificationRead } from "@/modules/notifications/services/notifications.server"

export const dynamic = "force-dynamic"

// PATCH /api/notifications/[id] — mark one notification read (SPEC §5.7 R2,
// task 7.4). Recipient only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await markNotificationRead(actor, id))
  } catch (error) {
    return errorResponse(error)
  }
}
