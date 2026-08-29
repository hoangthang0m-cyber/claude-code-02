import { COLLECTIONS } from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"

// Shared scoping for the analytics endpoints (SPEC §5.6). A project manager sees
// data over every project they manage (`mode: "manager"`); anyone else sees only
// their own assigned items across their member projects (`mode: "staff"`, §5.6
// R1 bullet 3 — no project/dept view). The per-role hard limit is task 8.7.

export interface AnalyticsScope {
  mode: "manager" | "staff"
  /** the projects whose content items are in scope */
  project_ids: string[]
}

export async function resolveAnalyticsScope(
  actor: AuthedUser
): Promise<AnalyticsScope> {
  const snap = await getAdminDb()
    .collection(COLLECTIONS.projectMembers)
    .where("user_id", "==", actor.uid)
    .get()

  const rows = snap.docs.map((d) => d.data())
  const managed = [
    ...new Set(
      rows
        .filter((r) => r.project_role === "manager")
        .map((r) => String(r.project_id))
    ),
  ]
  const all = [...new Set(rows.map((r) => String(r.project_id)))]

  return managed.length > 0
    ? { mode: "manager", project_ids: managed }
    : { mode: "staff", project_ids: all }
}

// chunk a Firestore `in` query (30-value cap) and flatten the results.
export async function chunkedIn<T>(
  ids: string[],
  run: (batch: string[]) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 30) {
    out.push(...(await run(ids.slice(i, i + 30))))
  }
  return out
}
