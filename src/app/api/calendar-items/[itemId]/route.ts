import { getAuthedUser } from "@/lib/server/auth"
import {
  deleteItem,
  updateItem,
} from "@/lib/server/calendar/calendarItemsService"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"

export const dynamic = "force-dynamic"

// PATCH /api/calendar-items/[itemId] — edit fields (Mục D task 5.2), also the
// drag move / resize path (group 7). Trưởng phòng any item; Nhân sự only their
// own or an item they are assigned to.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params
    const actor = await getAuthedUser(request)
    const result = await updateItem(
      getAdminDb(),
      actor,
      itemId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/calendar-items/[itemId] — soft delete (Undo-able, group 7). A body
// with `{ scope, occurrenceKey }` deletes one occurrence of a recurring series
// (task 8.5).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params
    const actor = await getAuthedUser(request)
    const body = await request.text().then((t) => (t ? JSON.parse(t) : {}))
    return Response.json(await deleteItem(getAdminDb(), actor, itemId, body))
  } catch (error) {
    return errorResponse(error)
  }
}
