import { clearCookie, readCookie } from "@/lib/server/cookies"
import { HttpError } from "@/lib/server/http"
import { completeGoogleConnect } from "@/modules/sheets-sync/services/googleConnection.server"
import { GOOGLE_STATE_COOKIE } from "@/app/api/google/connect/start/route"

export const dynamic = "force-dynamic"

// GET /api/google/connect/callback — Google redirects the manager's browser
// here with ?code & ?state (SPEC §6.3). No Bearer auth: the sealed state carries
// the manager's uid.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const params = new URL(request.url).searchParams
  const back = (q: string) => {
    const headers = new Headers()
    headers.append("Location", `${origin}/ad-accounts${q}`)
    headers.append("Set-Cookie", clearCookie(GOOGLE_STATE_COOKIE))
    return new Response(null, { status: 302, headers })
  }

  if (params.get("error")) {
    return back(`?google_error=${encodeURIComponent("Đã huỷ kết nối Google")}`)
  }

  try {
    const { email } = await completeGoogleConnect({
      code: params.get("code") ?? "",
      sealedState: params.get("state") ?? "",
      stateNonce: readCookie(request, GOOGLE_STATE_COOKIE),
      redirectUri: `${origin}/api/google/connect/callback`,
    })
    return back(`?google=connected&email=${encodeURIComponent(email)}`)
  } catch (error) {
    const message =
      error instanceof HttpError ? error.message : "Kết nối Google thất bại"
    return back(`?google_error=${encodeURIComponent(message)}`)
  }
}
