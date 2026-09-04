import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { reorderProject } from "@/modules/project-grouping/services/projectAssignment.server"

export const dynamic = "force-dynamic"

// PATCH /api/projects/[projectId]/order — reorder a project within its own
// bucket (project-grouping change task 4.5). Manager-only; body
// { after_id: string | null } (the project it follows, or null for the front).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await reorderProject(actor, projectId, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}
