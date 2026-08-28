import { getAuthedUser } from "@/lib/server/auth"
import { serializeCookie } from "@/lib/server/cookies"
import { errorResponse } from "@/lib/server/http"
import { beginGoogleConnect } from "@/modules/sheets-sync/services/googleConnection.server"

export const dynamic = "force-dynamic"

export const GOOGLE_STATE_COOKIE = "google_oauth_state"

// POST /api/google/connect/start — a manager begins Google OAuth for Sheets
// sync (SPEC §6.3). Returns the Google consent URL; stashes the CSRF nonce.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const redirectUri = `${new URL(request.url).origin}/api/google/connect/callback`
    const { url, nonce } = beginGoogleConnect(actor, redirectUri)

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": serializeCookie(GOOGLE_STATE_COOKIE, nonce, {
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
