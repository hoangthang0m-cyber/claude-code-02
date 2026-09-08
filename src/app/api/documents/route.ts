import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  createOrgDocument,
  listOrgDocuments,
} from "@/modules/document-library/services/orgDocuments.server"

export const dynamic = "force-dynamic"

// GET /api/documents?category=&q=&sort= — one library, optional partial-title
// search + sort (document-library task 1.4). Any signed-in member.
export async function GET(request: Request) {
  try {
    await getAuthedUser(request)
    const params = new URL(request.url).searchParams
    const result = await listOrgDocuments({
      category: params.get("category"),
      q: params.get("q") ?? undefined,
      sort: params.get("sort") ?? undefined,
    })
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

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
