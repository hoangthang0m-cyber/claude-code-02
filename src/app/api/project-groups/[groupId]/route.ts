import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { updateProjectGroup } from "@/modules/project-grouping/services/projectGroups.server"

export const dynamic = "force-dynamic"

// PATCH /api/project-groups/[groupId] — edit a group's name / description
// (project-grouping change task 2.2). Manager-only.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const actor = await getAuthedUser(request)
    const result = await updateProjectGroup(
      actor,
      groupId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
