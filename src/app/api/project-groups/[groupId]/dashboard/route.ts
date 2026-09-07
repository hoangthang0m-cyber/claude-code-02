import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getGroupDashboard } from "@/modules/project-grouping/services/groupRollup.server"

export const dynamic = "force-dynamic"

// GET /api/project-groups/[groupId]/dashboard — the six progress counters
// rolled up over the group's child projects the caller manages (project-grouping
// change task 5.1 / 5.2). Also returns projects_counted / projects_total.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await getGroupDashboard(actor, groupId))
  } catch (error) {
    return errorResponse(error)
  }
}
