import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  deleteProject,
  updateProject,
} from "@/modules/project-workspace/services/projects.server"

export const dynamic = "force-dynamic"

// PATCH /api/projects/[projectId] — edit the standard form (SPEC §5.1 R2).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    const result = await updateProject(
      actor,
      projectId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/projects/[projectId] — hard delete the project and cascade all of
// its child data (user-approved, NOT in SPEC.md). Project-manager only; body
// { confirm_name } must equal the project's name.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await deleteProject(actor, projectId, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}
