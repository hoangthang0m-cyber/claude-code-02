import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { createOrgDocument } from "@/modules/document-library/services/orgDocuments.server"

export const dynamic = "force-dynamic"

// POST /api/documents — add an item to a library (document-library task 1.2).
// Any signed-in member; category + title + url required.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await createOrgDocument(actor, await readJsonBody(request))
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
