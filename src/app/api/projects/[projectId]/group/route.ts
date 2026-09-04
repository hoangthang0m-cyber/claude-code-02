import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { setProjectGroup } from "@/modules/project-grouping/services/projectAssignment.server"

export const dynamic = "force-dynamic"

// PATCH /api/projects/[projectId]/group — assign a project to a group, move it,
// or clear it (project-grouping change task 3.1). Manager-only; body
// { group_id: string | null }.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    const result = await setProjectGroup(
      actor,
      projectId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
