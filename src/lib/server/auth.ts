import { COLLECTIONS, SYSTEM_ROLES, type SystemRole } from "@/lib/domain"
import { getAdminAuth, getAdminDb } from "@/lib/server/firebaseAdmin"
import { HttpError } from "@/lib/server/http"

// Server-side authentication for /api route handlers (SPEC §7.1 task 1.4:
// "verify đăng nhập và đọc được vai trò trong request").
//
// The client attaches its Firebase ID token as `Authorization: Bearer <token>`
// (see src/lib/api/authedFetch.ts). Here we verify it with the Admin SDK and
// resolve the caller's global `system_role` from their users/ document.

export interface AuthedUser {
  uid: string
  email: string | null
  system_role: SystemRole
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? ""
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) {
    throw new HttpError(401, "Thiếu Authorization: Bearer token")
  }
  return match[1].trim()
}

// A missing or unrecognised value defaults to the least-privileged role. The
// users/ doc is created with system_role on first login (upsertUserProfile);
// task 1.6 promotes the first account to manager.
function normalizeSystemRole(value: unknown): SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(value as string)
    ? (value as SystemRole)
    : "staff"
}

export async function getAuthedUser(request: Request): Promise<AuthedUser> {
  const token = bearerToken(request)

  // Resolve the Admin SDK outside the try/catch: a missing-credentials error is
  // an infrastructure fault (500), not a bad token (401).
  const adminAuth = getAdminAuth()
  const adminDb = getAdminDb()

  let uid: string
  let email: string | null
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    uid = decoded.uid
    email = decoded.email ?? null
  } catch {
    throw new HttpError(401, "Token không hợp lệ hoặc đã hết hạn")
  }

  const snap = await adminDb.collection(COLLECTIONS.users).doc(uid).get()

  return { uid, email, system_role: normalizeSystemRole(snap.data()?.system_role) }
}
