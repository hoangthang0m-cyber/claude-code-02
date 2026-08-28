import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { syncProjectSheetNow } from "@/modules/sheets-sync/services/sheetSync.server"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// POST /api/projects/[projectId]/sheet/sync — manual "đồng bộ ngay" (SPEC §5.5
// R2). Manager only. Task 6.3 runs the system → sheet direction.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await syncProjectSheetNow(actor, projectId))
  } catch (error) {
    return errorResponse(error)
  }
}
