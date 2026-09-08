import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { addKnowledgeProjectRef } from "@/modules/knowledge/services/knowledge.server"

export const dynamic = "force-dynamic"

// POST /api/knowledge/[entryId]/refs — attach a Project / ProjectGroup reference
// to "Quá trình đúc kết" (knowledge-base task 4.1). Any signed-in member; body
// { ref_type, ref_id, note? }. The target must exist; the server snapshots its
// name. 409 if the entry is archived.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await addKnowledgeProjectRef(actor, entryId, await readJsonBody(request)),
      { status: 201 }
    )
  } catch (error) {
    return errorResponse(error)
  }
}
