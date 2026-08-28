import { getAuthedUser } from "@/lib/server/auth"
import { clearCookie, readCookie } from "@/lib/server/cookies"
import { errorResponse } from "@/lib/server/http"
import { META_PENDING_COOKIE } from "@/lib/server/meta/oauth"
import { readJsonBody } from "@/lib/server/validate"
import {
  listAdAccountConnections,
  saveAdAccountConnection,
} from "@/modules/ads-performance/services/adAccounts.server"

export const dynamic = "force-dynamic"

// GET /api/ad-accounts — the caller's Meta Ad Account connections (SPEC §5.4
// R1). Token is never included.
export async function GET(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    return Response.json(await listAdAccountConnections(actor))
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/ad-accounts — the manager picks one ad account from the pending
// OAuth grant; saves it with the encrypted long-lived token, state `connected`.
// Body: { ad_account_id, name }.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const result = await saveAdAccountConnection(
      actor,
      await readJsonBody(request),
      readCookie(request, META_PENDING_COOKIE)
    )
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": clearCookie(META_PENDING_COOKIE),
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
