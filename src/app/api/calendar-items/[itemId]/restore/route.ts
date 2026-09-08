import { getAuthedUser } from "@/lib/server/auth"
import { restoreItem } from "@/lib/server/calendar/calendarItemsService"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"

export const dynamic = "force-dynamic"

// POST /api/calendar-items/[itemId]/restore — clear `deletedAt` (the Undo action
// behind the delete toast, group 7).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await restoreItem(getAdminDb(), actor, itemId))
  } catch (error) {
    return errorResponse(error)
  }
}
