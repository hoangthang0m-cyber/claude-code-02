import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { executeTransition } from "@/modules/production-workflow/services/workflow.server"

export const dynamic = "force-dynamic"

// POST /api/content/[contentItemId]/transition — move the production status
// (SPEC §5.3). Body: { to: ContentStatus, reason?: string }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    const result = await executeTransition(
      actor,
      contentItemId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
