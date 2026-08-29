import { csvResponse, toCsv } from "@/lib/csv"
import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import {
  comparisonCsvRows,
  reportCsvRows,
} from "@/modules/analytics/services/reportExport"
import {
  getPeriodComparison,
  getPeriodReport,
} from "@/modules/analytics/services/report.server"

export const dynamic = "force-dynamic"

// GET /api/dashboard/report?period=week|month&date=YYYY-MM-DD[&compare=1][&format=csv]
// The weekly / monthly overview report (SPEC §5.6 R3, task 8.3); with
// `compare=1`, also the previous period + per-metric deltas (§5.6 R4, task 8.4);
// with `format=csv`, the same numbers as a downloadable file (§5.6 R5, task 8.5).
// The period is resolved server-side in Asia/Ho_Chi_Minh, Monday week start
// (§8 Q4). `date` defaults to today.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const q = new URL(request.url).searchParams
    const kind = q.get("period") ?? "week"
    const date = q.get("date") ?? new Date().toISOString().slice(0, 10)
    const compare = q.get("compare") === "1" || q.get("compare") === "true"
    const asCsv = q.get("format") === "csv"

    if (compare) {
      const result = await getPeriodComparison(actor, kind, date)
      return asCsv
        ? csvResponse(
            `bao-cao-${kind}-${date}-so-sanh.csv`,
            toCsv(comparisonCsvRows(result))
          )
        : Response.json(result)
    }

    const result = await getPeriodReport(actor, kind, date)
    return asCsv
      ? csvResponse(
          `bao-cao-${kind}-${date}.csv`,
          toCsv(reportCsvRows(result))
        )
      : Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
