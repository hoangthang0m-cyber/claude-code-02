import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  deleteKnowledgeEntry,
  updateKnowledgeEntry,
} from "@/modules/knowledge/services/knowledge.server"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ entryId: string }> }

// PATCH /api/knowledge/[entryId] — edit content (knowledge-base task 2.2).
// Any signed-in member; 409 if the entry is archived.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { entryId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await updateKnowledgeEntry(actor, entryId, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/knowledge/[entryId] — hard delete + cascade (task 2.4).
// Manager only; body { confirm_name } must echo the entry's name.
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { entryId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await deleteKnowledgeEntry(actor, entryId, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}
