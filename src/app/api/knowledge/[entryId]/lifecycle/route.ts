import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { setKnowledgeEntryLifecycle } from "@/modules/knowledge/services/knowledge.server"

export const dynamic = "force-dynamic"

// POST /api/knowledge/[entryId]/lifecycle — archive / restore (task 2.3).
// Manager only. Body: { lifecycle: "active" | "archived" }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await setKnowledgeEntryLifecycle(actor, entryId, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}
