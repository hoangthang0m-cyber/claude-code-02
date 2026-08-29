import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  listNotificationPreferences,
  setNotificationPreference,
} from "@/modules/notifications/services/notificationPreferences.server"

export const dynamic = "force-dynamic"

// GET /api/notification-preferences — all 6 groups with their effective on/off
// state for the caller (SPEC §5.7 R4, task 7.5).
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(await listNotificationPreferences(actor))
  } catch (error) {
    return errorResponse(error)
  }
}

// PUT /api/notification-preferences — toggle one group: { group, enabled }.
export async function PUT(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(
      await setNotificationPreference(actor, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}
