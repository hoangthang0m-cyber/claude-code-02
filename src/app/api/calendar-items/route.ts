import { getAuthedUser } from "@/lib/server/auth"
import { createItem } from "@/lib/server/calendar/calendarItemsService"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"

export const dynamic = "force-dynamic"

// POST /api/calendar-items — create a calendar item (Mục D task 5.2 / 7.1).
// Any active member may create in a calendar they can write (Mục B
// `calendar-access-control`); the service enforces archived / managerOnly.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await createItem(
      getAdminDb(),
      actor,
      await readJsonBody(request)
    )
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
