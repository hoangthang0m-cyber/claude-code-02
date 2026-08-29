import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  createContentItem,
  listContentItems,
} from "@/modules/content-pipeline/services/content.server"

export const dynamic = "force-dynamic"

// GET /api/projects/[projectId]/content — filtered + sorted list (SPEC §5.2 R4).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    const filters = Object.fromEntries(new URL(request.url).searchParams)
    return Response.json(await listContentItems(actor, projectId, filters))
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/projects/[projectId]/content — create a content item (SPEC §5.2 R1).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    const result = await createContentItem(
      actor,
      projectId,
      await readJsonBody(request)
    )
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
