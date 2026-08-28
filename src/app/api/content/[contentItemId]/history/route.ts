import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { listStatusHistory } from "@/modules/production-workflow/services/workflow.server"

export const dynamic = "force-dynamic"

// GET /api/content/[contentItemId]/history — the transition log, oldest first
// (SPEC §5.3 R5). Any project member can read it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await listStatusHistory(actor, contentItemId))
  } catch (error) {
    return errorResponse(error)
  }
}
