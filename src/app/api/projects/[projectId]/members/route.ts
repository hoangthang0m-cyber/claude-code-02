import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { addProjectMember } from "@/modules/project-workspace/services/members.server"

export const dynamic = "force-dynamic"

// POST /api/projects/[projectId]/members — add a member (SPEC §5.1 R4).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    const result = await addProjectMember(
      actor,
      projectId,
      await readJsonBody(request)
    )
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
