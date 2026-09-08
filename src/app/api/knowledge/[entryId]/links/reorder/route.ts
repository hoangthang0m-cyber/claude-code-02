import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { reorderKnowledgeLinks } from "@/modules/knowledge/services/knowledge.server"

export const dynamic = "force-dynamic"

// PUT /api/knowledge/[entryId]/links/reorder — reorder one section's links
// (knowledge-base task 3.3). Body { section, ordered_ids } must be the exact set
// of that section's link ids. Any signed-in member.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await reorderKnowledgeLinks(actor, entryId, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}
