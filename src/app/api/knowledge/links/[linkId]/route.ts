import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  deleteKnowledgeLink,
  updateKnowledgeLink,
} from "@/modules/knowledge/services/knowledge.server"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ linkId: string }> }

// PATCH /api/knowledge/links/[linkId] — edit url / label / note
// (knowledge-base task 3.2). Any signed-in member.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { linkId } = await params
    await getAuthedUser(request)
    return Response.json(
      await updateKnowledgeLink(linkId, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/knowledge/links/[linkId] — remove a link (task 3.2).
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { linkId } = await params
    await getAuthedUser(request)
    return Response.json(await deleteKnowledgeLink(linkId))
  } catch (error) {
    return errorResponse(error)
  }
}
