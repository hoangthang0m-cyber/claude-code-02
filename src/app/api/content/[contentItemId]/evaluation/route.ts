import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { setEvaluation } from "@/modules/content-pipeline/services/content.server"

export const dynamic = "force-dynamic"

// PATCH /api/content/[contentItemId]/evaluation — the manager's free-text
// "đánh giá / đề xuất" note (SPEC §5.4 R5). Manager only. Body:
// { evaluation: string | null }.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    const result = await setEvaluation(
      actor,
      contentItemId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
