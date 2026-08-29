import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse, HttpError } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import {
  getSheetMapping,
  saveSheetMapping,
  setSheetSyncEnabled,
} from "@/modules/sheets-sync/services/sheetMapping.server"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET /api/projects/[projectId]/sheet/mapping — the project's SheetSyncMapping
// (SPEC §5.5 R1). Any project member.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(await getSheetMapping(actor, projectId))
  } catch (error) {
    return errorResponse(error)
  }
}

// PUT /api/projects/[projectId]/sheet/mapping — save the mapping and run the
// first sheet→system pull (SPEC §5.5 R1). Manager only.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    return Response.json(
      await saveSheetMapping(actor, projectId, await readJsonBody(request))
    )
  } catch (error) {
    return errorResponse(error)
  }
}

// PATCH /api/projects/[projectId]/sheet/mapping — turn background sync on/off
// for the project (SPEC §5.5 R4, task 6.9). Manager only. Body: { sync_enabled }.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    const body = (await readJsonBody(request)) as { sync_enabled?: unknown }
    if (typeof body.sync_enabled !== "boolean") {
      throw new HttpError(400, "Thiếu 'sync_enabled' (true/false)")
    }
    return Response.json(
      await setSheetSyncEnabled(actor, projectId, body.sync_enabled)
    )
  } catch (error) {
    return errorResponse(error)
  }
}
