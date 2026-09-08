import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { reorderReferenceLinkList } from "@/modules/reference-links/services/referenceLinks.server"

export const dynamic = "force-dynamic"

// PUT /api/reference-links/reorder — drag-reorder one owner's list (task 3.3).
// Body: { owner_type, owner_id, ordered_ids: string[] } — must be the exact set
// of that owner's link ids. Any project member.
export async function PUT(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(
      await reorderReferenceLinkList(actor, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}
