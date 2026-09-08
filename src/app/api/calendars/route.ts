import { calendarCreateSchema } from "@/lib/domain/calendar"
import { requireSystemManager } from "@/lib/permissions/projectScope"
import { getAuthedUser } from "@/lib/server/auth"
import { createCalendar } from "@/lib/server/calendar/calendarsRepo"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"
import { parseOrThrow, readJsonBody } from "@/lib/server/validate"

export const dynamic = "force-dynamic"

// POST /api/calendars — create a shared sub-calendar (Mục D task 4.3).
// Trưởng phòng only (Mục B `calendar-access-control`).
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    requireSystemManager(actor, "Chỉ Trưởng phòng được tạo lịch con")
    const input = parseOrThrow(calendarCreateSchema, await readJsonBody(request))
    const result = await createCalendar(getAdminDb(), input)
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
