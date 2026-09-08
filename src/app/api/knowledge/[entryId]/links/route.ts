import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { addKnowledgeLink } from "@/modules/knowledge/services/knowledge.server"

export const dynamic = "force-dynamic"

// POST /api/knowledge/[entryId]/links — attach a labelled link to one section
// (knowledge-base task 3.1). Any signed-in member; body { section, url, label,
// note? }. 409 if the entry is archived.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await addKnowledgeLink(actor, entryId, await readJsonBody(request)),
      { status: 201 }
    )
  } catch (error) {
    return errorResponse(error)
  }
}
