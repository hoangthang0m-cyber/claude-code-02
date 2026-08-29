import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getPeriodReport } from "@/modules/analytics/services/report.server"

export const dynamic = "force-dynamic"

// GET /api/dashboard/report?period=week|month&date=YYYY-MM-DD — the weekly /
// monthly overview report (SPEC §5.6 R3, task 8.3). The period is resolved
// server-side in Asia/Ho_Chi_Minh, Monday week start (§8 Q4). `date` defaults to
// today.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const q = new URL(request.url).searchParams
    const kind = q.get("period") ?? "week"
    const date = q.get("date") ?? new Date().toISOString().slice(0, 10)
    return Response.json(await getPeriodReport(actor, kind, date))
  } catch (error) {
    return errorResponse(error)
  }
}
