import { getAuthedUser } from "@/lib/server/auth"
import { syncSelfMember } from "@/lib/server/calendar/membersSync"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import { errorResponse } from "@/lib/server/http"

export const dynamic = "force-dynamic"

// POST /api/members/self — mirror the caller's `users/{uid}` doc into
// `members/{uid}` and make sure their personal calendar exists. The client calls
// this once per session right after login (src/context/AuthContext.tsx),
// standing in for the Cloud Function `onWrite` sync from Mục C §7 (spec doc
// answer #2). Idempotent.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await syncSelfMember(getAdminDb(), actor)
    return Response.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
