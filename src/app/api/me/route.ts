import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"

// Verifiable artifact for SPEC §7.1 task 1.4: an authenticated request can read
// back its own identity and `system_role`. Also the endpoint the client uses to
// confirm a session server-side.

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    return Response.json(await getAuthedUser(request))
  } catch (error) {
    return errorResponse(error)
  }
}
