import { csvResponse, toCsv } from "@/lib/csv"
import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import {
  getGroupPeriodComparison,
  getGroupPeriodReport,
  getGroupReportPerProject,
} from "@/modules/project-grouping/services/groupRollup.server"
import { groupReportCsvRows } from "@/modules/project-grouping/services/groupRollupExport"

export const dynamic = "force-dynamic"

// GET /api/project-groups/[groupId]/report?period=week|month&date=YYYY-MM-DD
//   [&compare=1][&format=csv]
// The §5.6 R3 report rolled up over the group (project-grouping task 5.3); with
// compare=1 the previous-period deltas (task 5.4); with format=csv a per-child
// breakdown file, no group total (task 5.5).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const actor = await getAuthedUser(request)
    const q = new URL(request.url).searchParams
    const kind = q.get("period") ?? "week"
    const date = q.get("date") ?? new Date().toISOString().slice(0, 10)
    const compare = q.get("compare") === "1" || q.get("compare") === "true"
    const asCsv = q.get("format") === "csv"

    if (asCsv) {
      const per = await getGroupReportPerProject(actor, groupId, kind, date)
      return csvResponse(
        `bao-cao-nhom-${kind}-${date}.csv`,
        toCsv(groupReportCsvRows(per))
      )
    }

    if (compare) {
      return Response.json(
        await getGroupPeriodComparison(actor, groupId, kind, date)
      )
    }

    return Response.json(await getGroupPeriodReport(actor, groupId, kind, date))
  } catch (error) {
    return errorResponse(error)
  }
}
