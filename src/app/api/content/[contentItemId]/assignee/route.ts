import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { assignContentItem } from "@/modules/content-pipeline/services/content.server"

export const dynamic = "force-dynamic"

// PUT /api/content/[contentItemId]/assignee — assign / claim / unassign
// (SPEC §5.2 R2). Body: { assignee_id: string | null }.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    const result = await assignContentItem(
      actor,
      contentItemId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
