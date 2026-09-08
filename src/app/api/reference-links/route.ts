import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse, HttpError } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  addReferenceLink,
  listReferenceLinks,
} from "@/modules/reference-links/services/referenceLinks.server"

export const dynamic = "force-dynamic"

// GET /api/reference-links?owner_type=project|content_item&owner_id=<id>
// The owner's links, ordered by sort_index (tasks 3.3 / 3.6). Any project
// member.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const { searchParams } = new URL(request.url)
    const ownerType = searchParams.get("owner_type")
    const ownerId = searchParams.get("owner_id")
    if (
      (ownerType !== "project" && ownerType !== "content_item") ||
      !ownerId
    ) {
      throw new HttpError(400, "Cần owner_type (project|content_item) + owner_id")
    }
    return Response.json(await listReferenceLinks(actor, ownerType, ownerId))
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/reference-links — add a link (task 3.1). Body:
// { owner_type, owner_id, url, label, note? }. Any project member.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await addReferenceLink(actor, await readJsonBody(request))
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
