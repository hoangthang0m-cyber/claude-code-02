import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import {
  getProjectSheetSyncLog,
  syncProjectSheetNow,
} from "@/modules/sheets-sync/services/sheetSync.server"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// POST /api/projects/[projectId]/sheet/sync — manual "đồng bộ ngay" (SPEC §5.5
// R2). Manager only. Runs both directions.
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

// GET /api/projects/[projectId]/sheet/sync — the sync status + log screen
// (SPEC §5.5 R3 / R4, task 6.8): recent SyncRuns and SyncConflicts. Any member.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await getProjectSheetSyncLog(actor, projectId))
  } catch (error) {
    return errorResponse(error)
  }
}
