import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { createProjectGroup } from "@/modules/project-grouping/services/projectGroups.server"

export const dynamic = "force-dynamic"

// POST /api/project-groups — create a project group (project-grouping change
// task 2.1). Manager-only; name required, description optional.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await createProjectGroup(actor, await readJsonBody(request))
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
