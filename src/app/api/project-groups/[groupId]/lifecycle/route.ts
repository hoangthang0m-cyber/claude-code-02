import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { setProjectGroupLifecycle } from "@/modules/project-grouping/services/projectGroups.server"

export const dynamic = "force-dynamic"

// POST /api/project-groups/[groupId]/lifecycle — archive a group or restore it
// (project-grouping change task 2.3). Manager-only; body { lifecycle:
// "active" | "archived" }. Does not touch the group's projects.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const actor = await getAuthedUser(request)
    const result = await setProjectGroupLifecycle(
      actor,
      groupId,
      await readJsonBody(request)
    )
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
