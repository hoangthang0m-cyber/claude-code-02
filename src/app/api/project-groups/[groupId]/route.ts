import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  deleteProjectGroup,
  updateProjectGroup,
} from "@/modules/project-grouping/services/projectGroups.server"

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

// DELETE /api/project-groups/[groupId] — delete a group (project-grouping change
// task 2.4). Manager-only. Projects in the group have group_id cleared; none is
// deleted. The client shows the confirmation.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await deleteProjectGroup(actor, groupId))
  } catch (error) {
    return errorResponse(error)
  }
}
