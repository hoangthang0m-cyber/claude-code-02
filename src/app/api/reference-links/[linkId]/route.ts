import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  deleteReferenceLink,
  updateReferenceLink,
} from "@/modules/reference-links/services/referenceLinks.server"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ linkId: string }> }

// PATCH /api/reference-links/[linkId] — edit url / label / note (task 3.2).
// Any member of the owning project.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { linkId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await updateReferenceLink(actor, linkId, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/reference-links/[linkId] — remove a link (task 3.2 / 3.5).
// Any member of the owning project (including staff).
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { linkId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await deleteReferenceLink(actor, linkId))
  } catch (error) {
    return errorResponse(error)
  }
}
