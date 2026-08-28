import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { previewSheet } from "@/modules/sheets-sync/services/sheetMapping.server"

export const dynamic = "force-dynamic"

// POST /api/projects/[projectId]/sheet/preview — verify a Google Sheets URL and
// return its header-row column names so the mapping screen can offer them
// (SPEC §5.5 R1). Body: { url, header_row }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const actor = await getAuthedUser(request)
    const body = (await readJsonBody(request)) as {
      url?: string
      header_row?: number
    }
    return Response.json(
      await previewSheet(
        actor,
        projectId,
        String(body.url ?? ""),
        Number(body.header_row ?? 1)
      )
    )
  } catch (error) {
    return errorResponse(error)
  }
}
