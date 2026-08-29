import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { createProject } from "@/modules/project-workspace/services/projects.server"

export const dynamic = "force-dynamic"

// POST /api/projects — create a project (SPEC §5.1 R1).
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await createProject(actor, await readJsonBody(request))
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
