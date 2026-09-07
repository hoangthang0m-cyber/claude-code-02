import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import {
  getVideoComparison,
  videoComparisonCsv,
} from "@/modules/ads-overview/services/videoComparison.server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/ads-reporting/video-comparison?items=a,b,c&period=...&metrics=ctr,reach&bucket=day
// Per content item, the 4 core video metrics + requested extras over the period
// (tasks 6.3–6.6). `?format=csv` returns the table as CSV (task 6.8). Manager
// only; max 6 items.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const { searchParams } = new URL(request.url)
    const result = await getVideoComparison(actor, searchParams)

    if (searchParams.get("format") === "csv") {
      return new Response(`﻿${videoComparisonCsv(result)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="so-sanh-video_${result.window.from}_${result.window.to}.csv"`,
        },
      })
    }
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
