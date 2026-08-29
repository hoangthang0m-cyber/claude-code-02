import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { verifyProjectSheet } from "@/modules/sheets-sync/services/googleConnection.server"

export const dynamic = "force-dynamic"

// POST /api/projects/[projectId]/sheet/verify — check a Google Sheets URL is a
// valid sheet the acting manager can read + write, before a mapping is saved
// (SPEC §5.1 R1 / §5.5 R1). Body: { url }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    const body = (await readJsonBody(request)) as { url?: string }
    return Response.json(
      await verifyProjectSheet(actor, projectId, String(body.url ?? ""))
    )
  } catch (error) {
    return errorResponse(error)
  }
}
