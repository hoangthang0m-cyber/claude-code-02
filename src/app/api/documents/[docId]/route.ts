import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  deleteOrgDocument,
  updateOrgDocument,
} from "@/modules/document-library/services/orgDocuments.server"

export const dynamic = "force-dynamic"

// PATCH /api/documents/[docId] — edit an item (document-library task 1.3).
// Any signed-in member; title / url / doc_date / note.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params
    const actor = await getAuthedUser(request)
    const result = await updateOrgDocument(
      actor,
      docId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/documents/[docId] — remove an item (document-library task 1.3).
// Any signed-in member.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params
    await getAuthedUser(request)
    return Response.json(await deleteOrgDocument(docId))
  } catch (error) {
    return errorResponse(error)
  }
}
