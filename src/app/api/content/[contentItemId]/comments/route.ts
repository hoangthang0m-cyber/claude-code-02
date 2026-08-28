import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  createComment,
  listComments,
} from "@/modules/content-pipeline/services/comments.server"

export const dynamic = "force-dynamic"

// GET /api/content/[contentItemId]/comments — list, oldest first (SPEC §5.2 R5).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await listComments(actor, contentItemId))
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/content/[contentItemId]/comments — add a comment + @mentions
// (SPEC §5.2 R5). Body: { body, mentions?: string[] }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    const result = await createComment(
      actor,
      contentItemId,
      await readJsonBody(request)
    )
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
