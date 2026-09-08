import { calendarCreateSchema } from "@/lib/domain/calendar"
import { getAuthedUser } from "@/lib/server/auth"
import { requireCalendarManager } from "@/lib/server/calendar/access"
import { createCalendar } from "@/lib/server/calendar/calendarsRepo"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"
import { parseOrThrow, readJsonBody } from "@/lib/server/validate"

export const dynamic = "force-dynamic"

// POST /api/calendars — create a shared sub-calendar (Mục D task 4.3).
// Trưởng phòng only (Mục B `calendar-access-control`), role read from
// members/{uid}.role (task 11.3).
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const db = getAdminDb()
    await requireCalendarManager(db, actor.uid, "Chỉ Trưởng phòng được tạo lịch con")
    const input = parseOrThrow(calendarCreateSchema, await readJsonBody(request))
    const result = await createCalendar(db, input)
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
