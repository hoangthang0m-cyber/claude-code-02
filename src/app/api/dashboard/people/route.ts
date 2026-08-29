import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { getPeoplePerformance } from "@/modules/analytics/services/people.server"

export const dynamic = "force-dynamic"

// GET /api/dashboard/people?from=<ms>&to=<ms> — per-person workload (SPEC §5.6
// R2, task 8.2). `from`/`to` bound the "hoàn tất trong kỳ" window (epoch ms);
// default is the current UTC calendar month.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const url = new URL(request.url)
    const num = (k: string) => {
      const raw = url.searchParams.get(k)
      return raw != null && raw !== "" ? Number(raw) : undefined
    }
    return Response.json(
      await getPeoplePerformance(actor, { from: num("from"), to: num("to") })
    )
  } catch (error) {
    return errorResponse(error)
  }
}
