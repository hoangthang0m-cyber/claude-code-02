import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { deleteKnowledgeProjectRef } from "@/modules/knowledge/services/knowledge.server"

export const dynamic = "force-dynamic"

// DELETE /api/knowledge/refs/[refId] — detach a Project / ProjectGroup reference
// (knowledge-base task 4.2). Any signed-in member; the target is untouched.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ refId: string }> }
) {
  try {
    const { refId } = await params
    await getAuthedUser(request)
    return Response.json(await deleteKnowledgeProjectRef(refId))
  } catch (error) {
    return errorResponse(error)
  }
}
