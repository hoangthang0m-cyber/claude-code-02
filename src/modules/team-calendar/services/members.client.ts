import { authedFetch } from "@/lib/api/authedFetch"

// Client side of the member sync (Mục C §7 / spec doc answer #2). Called once
// per session from AuthContext after `upsertUserProfile` resolves, so
// `members/{uid}` and the caller's personal calendar exist before the calendar
// UI loads. Non-fatal on failure — the nightly `/api/jobs/members-reconcile`
// job catches everyone up.
export async function syncSelfMember(): Promise<void> {
  try {
    await authedFetch("/api/members/self", { method: "POST" })
  } catch {
    // ignore — reconcile job is the backstop
  }
}
