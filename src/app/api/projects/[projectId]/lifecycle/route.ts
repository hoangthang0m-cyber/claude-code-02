import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { changeProjectLifecycle } from "@/modules/project-workspace/services/projects.server"

export const dynamic = "force-dynamic"

// POST /api/projects/[projectId]/lifecycle — running / done / archived
// (SPEC §5.1 R3).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    const result = await changeProjectLifecycle(
      actor,
      projectId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
