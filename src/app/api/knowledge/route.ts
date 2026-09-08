import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { createKnowledgeEntry } from "@/modules/knowledge/services/knowledge.server"

export const dynamic = "force-dynamic"

// POST /api/knowledge — create a knowledge entry (knowledge-base task 2.1).
// Any signed-in member; name + overview required.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await createKnowledgeEntry(actor, await readJsonBody(request))
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
