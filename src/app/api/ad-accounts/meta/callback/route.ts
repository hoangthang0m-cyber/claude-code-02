import { clearCookie, readCookie, serializeCookie } from "@/lib/server/cookies"
import { HttpError } from "@/lib/server/http"
import {
  META_PENDING_COOKIE,
  META_STATE_COOKIE,
  pendingCookieOptions,
} from "@/lib/server/meta/oauth"
import { completeMetaConnect } from "@/modules/ads-performance/services/adAccounts.server"

export const dynamic = "force-dynamic"

// GET /api/ad-accounts/meta/callback — Facebook redirects the manager's browser
// here with ?code & ?state (SPEC §5.4 R1). No Bearer auth: the sealed state
// carries the manager's uid. On success, seal the long-lived token + account
// list into an httpOnly cookie and send the manager to the picker page.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const params = new URL(request.url).searchParams
  const redirect = (path: string) =>
    new Response(null, { status: 302, headers: new Headers({ Location: `${origin}${path}` }) })

  // The user declined the Facebook dialog.
  if (params.get("error")) {
    return redirect(`/ad-accounts?error=${encodeURIComponent("Đã huỷ kết nối Meta")}`)
  }

  try {
    const { sealedPending, accountCount } = await completeMetaConnect({
      code: params.get("code") ?? "",
      sealedState: params.get("state") ?? "",
      stateNonce: readCookie(request, META_STATE_COOKIE),
      redirectUri: `${origin}/api/ad-accounts/meta/callback`,
    })

    const headers = new Headers()
    headers.append("Location", `${origin}/ad-accounts?picking=${accountCount}`)
    headers.append("Set-Cookie", clearCookie(META_STATE_COOKIE))
    headers.append(
      "Set-Cookie",
      serializeCookie(META_PENDING_COOKIE, sealedPending, pendingCookieOptions)
    )
    return new Response(null, { status: 302, headers })
  } catch (error) {
    const message =
      error instanceof HttpError ? error.message : "Kết nối Meta thất bại"
    const headers = new Headers()
    headers.append("Location", `${origin}/ad-accounts?error=${encodeURIComponent(message)}`)
    headers.append("Set-Cookie", clearCookie(META_STATE_COOKIE))
    return new Response(null, { status: 302, headers })
  }
}
