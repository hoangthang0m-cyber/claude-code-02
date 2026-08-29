import { csvResponse, toCsv } from "@/lib/csv"
import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getPeoplePerformance } from "@/modules/analytics/services/people.server"
import { peopleCsvRows } from "@/modules/analytics/services/reportExport"

export const dynamic = "force-dynamic"

// GET /api/dashboard/people?from=<ms>&to=<ms>[&format=csv] — per-person workload
// (SPEC §5.6 R2, task 8.2). `from`/`to` bound the "hoàn tất trong kỳ" window
// (epoch ms); default is the current UTC calendar month. `format=csv` downloads
// the same table (§5.6 R5, task 8.5).
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const url = new URL(request.url)
    const num = (k: string) => {
      const raw = url.searchParams.get(k)
      return raw != null && raw !== "" ? Number(raw) : undefined
    }
    const result = await getPeoplePerformance(actor, {
      from: num("from"),
      to: num("to"),
    })
    if (url.searchParams.get("format") === "csv") {
      return csvResponse(
        `theo-nhan-su-${new Date(result.period.from).toISOString().slice(0, 10)}.csv`,
        toCsv(peopleCsvRows(result))
      )
    }
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
