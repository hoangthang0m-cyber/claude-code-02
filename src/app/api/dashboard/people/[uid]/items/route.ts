import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getPersonItems } from "@/modules/analytics/services/personItems.server"

export const dynamic = "force-dynamic"

// GET /api/dashboard/people/[uid]/items?status=<status> — a person's content
// items across the caller's scope, optionally filtered by status (SPEC §5.6 R2,
// task 8.6 — the drill-down from the per-person table).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid } = await params
    const actor = await getAuthedUser(request)
    const status = new URL(request.url).searchParams.get("status") ?? undefined
    return Response.json(await getPersonItems(actor, uid, status))
  } catch (error) {
    return errorResponse(error)
  }
}
