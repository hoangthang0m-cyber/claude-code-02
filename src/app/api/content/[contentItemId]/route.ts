import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  deleteContentItem,
  updateContentItemFields,
} from "@/modules/content-pipeline/services/content.server"

export const dynamic = "force-dynamic"

// PATCH /api/content/[contentItemId] — edit content fields (SPEC §5.2 R1).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    const result = await updateContentItemFields(
      actor,
      contentItemId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/content/[contentItemId] — xoá vĩnh viễn hạng mục và dữ liệu treo
// vào nó. Ngoài phạm vi SPEC; manager của dự án mới gọi được.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ contentItemId: string }> }
) {
  try {
    const { contentItemId } = await params
    const actor = await getAuthedUser(request)
    const result = await deleteContentItem(
      actor,
      contentItemId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
