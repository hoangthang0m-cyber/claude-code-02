import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  removeProjectMember,
  updateProjectMember,
} from "@/modules/project-workspace/services/members.server"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ projectId: string; memberId: string }> }

// PATCH /api/projects/[projectId]/members/[memberId] — change role / skill tag.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { projectId, memberId } = await params
    const actor = await getAuthedUser(request)
    const result = await updateProjectMember(
      actor,
      projectId,
      memberId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/projects/[projectId]/members/[memberId] — remove a member
// (blocked while they hold unfinished work, SPEC §5.1 R4).
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const { projectId, memberId } = await params
    const actor = await getAuthedUser(request)
    const result = await removeProjectMember(actor, projectId, memberId)
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
