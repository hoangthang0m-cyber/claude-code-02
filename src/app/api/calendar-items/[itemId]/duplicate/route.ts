import { getAuthedUser } from "@/lib/server/auth"
import { duplicateItem } from "@/lib/server/calendar/calendarItemsService"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"

export const dynamic = "force-dynamic"

// POST /api/calendar-items/[itemId]/duplicate — a new independent item, every
// field copied except the recurrence rule (Mục B `calendar-item-editing`).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await duplicateItem(getAdminDb(), actor, itemId),
      { status: 201 }
    )
  } catch (error) {
    return errorResponse(error)
  }
}
