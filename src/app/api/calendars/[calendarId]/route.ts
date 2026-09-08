import {
  calendarDeleteSchema,
  calendarUpdateSchema,
} from "@/lib/domain/calendar"
import { requireSystemManager } from "@/lib/permissions/projectScope"
import { getAuthedUser } from "@/lib/server/auth"
import {
  deleteCalendar,
  updateCalendar,
} from "@/lib/server/calendar/calendarsRepo"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"
import { parseOrThrow, readJsonBody } from "@/lib/server/validate"

export const dynamic = "force-dynamic"

// PATCH /api/calendars/[calendarId] — edit fields or toggle `archived`
// (Mục D tasks 4.3 / 4.5). Trưởng phòng only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ calendarId: string }> }
) {
  try {
    const { calendarId } = await params
    const actor = await getAuthedUser(request)
    requireSystemManager(actor, "Chỉ Trưởng phòng được sửa lịch con")
    const patch = parseOrThrow(calendarUpdateSchema, await readJsonBody(request))
    await updateCalendar(getAdminDb(), calendarId, patch)
    return Response.json({ id: calendarId })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/calendars/[calendarId] — delete a sub-calendar (Mục D task 4.4).
// Body: { mode: "reassign" | "deleteItems", targetCalendarId?: string }.
// Trưởng phòng only; the client owns the confirmation dialog.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ calendarId: string }> }
) {
  try {
    const { calendarId } = await params
    const actor = await getAuthedUser(request)
    requireSystemManager(actor, "Chỉ Trưởng phòng được xoá lịch con")
    const { mode, targetCalendarId } = parseOrThrow(
      calendarDeleteSchema,
      await readJsonBody(request)
    )
    const result = await deleteCalendar(
      getAdminDb(),
      calendarId,
      mode,
      targetCalendarId
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
