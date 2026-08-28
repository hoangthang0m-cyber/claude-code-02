import { getAuthedUser } from "@/lib/server/auth"
import { serializeCookie } from "@/lib/server/cookies"
import { errorResponse } from "@/lib/server/http"
import { META_STATE_COOKIE } from "@/lib/server/meta/oauth"
import { beginMetaConnect } from "@/modules/ads-performance/services/adAccounts.server"

export const dynamic = "force-dynamic"

// POST /api/ad-accounts/meta/start — a manager begins the Meta OAuth connect
// flow (SPEC §5.4 R1). Returns the Facebook login URL for the client to
// navigate to; stashes the CSRF nonce in an httpOnly cookie.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const redirectUri = `${new URL(request.url).origin}/api/ad-accounts/meta/callback`
    const { url, nonce } = beginMetaConnect(actor, redirectUri)

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": serializeCookie(META_STATE_COOKIE, nonce, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "Lax",
          maxAge: 600,
        }),
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
