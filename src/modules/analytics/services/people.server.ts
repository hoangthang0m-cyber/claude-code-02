import {
  COLLECTIONS,
  EMPTY_PERSON_PERFORMANCE,
  computePersonPerformance,
  type ContentStatus,
  type PersonItemInput,
  type PersonPerformance,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import {
  chunkedIn,
  resolveAnalyticsScope,
} from "@/modules/analytics/services/scope.server"

// SPEC §5.6 R2, task 8.2: per-person workload — items in progress, completed in
// the viewed period, overdue, and the mean lead time (nhận việc → "Đã duyệt").
//
// "nhận việc" is proxied by the item's earliest StatusHistory entry (work first
// moved) because assignment itself is not recorded in StatusHistory; "Đã duyệt"
// is the `to_status == "da_duyet"` entry. Both counts are for the item's current
// assignee.

export interface PersonPerformanceRow extends PersonPerformance {
  user_id: string
  name: string
}

export interface PeoplePerformanceResult {
  mode: "manager" | "staff"
  period: { from: number; to: number }
  people: PersonPerformanceRow[]
}

function tsMs(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : null
}

// Default period: the current calendar month in UTC. The client passes explicit
// bounds for any other period; the report's week-start / timezone rule is Open
// Question Q4 and lands with task 8.3.
function defaultPeriod(): { from: number; to: number } {
  const now = new Date()
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  return { from, to }
}

export async function getPeoplePerformance(
  actor: AuthedUser,
  opts: { from?: number; to?: number } = {}
): Promise<PeoplePerformanceResult> {
  const db = getAdminDb()
  const { mode, project_ids: scopeProjects } = await resolveAnalyticsScope(actor)

  const period = {
    from: Number.isFinite(opts.from) ? (opts.from as number) : defaultPeriod().from,
    to: Number.isFinite(opts.to) ? (opts.to as number) : defaultPeriod().to,
  }

  if (scopeProjects.length === 0) {
    return { mode, period, people: [] }
  }

  // members in scope (a manager sees everyone; a non-manager sees only self)
  const memberDocs = await chunkedIn(scopeProjects, async (batch) => {
    const snap = await db
      .collection(COLLECTIONS.projectMembers)
      .where("project_id", "in", batch)
      .get()
    return snap.docs
  })
  let memberUids = [
    ...new Set(memberDocs.map((d) => String(d.data().user_id ?? ""))),
  ].filter(Boolean)
  if (mode === "staff") memberUids = memberUids.filter((u) => u === actor.uid)
  if (memberUids.length === 0) return { mode, period, people: [] }

  // content items in scope
  const itemDocs = await chunkedIn(scopeProjects, async (batch) => {
    const snap = await db
      .collection(COLLECTIONS.contentItems)
      .where("project_id", "in", batch)
      .get()
    return snap.docs
  })
  const items = itemDocs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((i) => memberUids.includes(String(i.data.assignee_id ?? "")))

  // status history for those items → earliest entry + the da_duyet entry
  const historyDocs = await chunkedIn(
    items.map((i) => i.id),
    async (batch) => {
      const snap = await db
        .collection(COLLECTIONS.statusHistory)
        .where("content_item_id", "in", batch)
        .get()
      return snap.docs
    }
  )
  const startedMs = new Map<string, number>()
  const approvedMs = new Map<string, number>()
  for (const h of historyDocs) {
    const d = h.data()
    const itemId = String(d.content_item_id ?? "")
    const at = tsMs(d.created_at)
    if (at == null) continue
    const prevStart = startedMs.get(itemId)
    if (prevStart == null || at < prevStart) startedMs.set(itemId, at)
    if (d.to_status === "da_duyet") {
      const prevApproved = approvedMs.get(itemId)
      if (prevApproved == null || at < prevApproved) approvedMs.set(itemId, at)
    }
  }

  // names
  const names = new Map<string, string>()
  await Promise.all(
    memberUids.map(async (uid) => {
      const u = await db.collection(COLLECTIONS.users).doc(uid).get()
      names.set(uid, String(u.data()?.name ?? "").trim() || uid)
    })
  )

  const now = Date.now()
  const byPerson = new Map<string, PersonItemInput[]>()
  for (const uid of memberUids) byPerson.set(uid, [])
  for (const i of items) {
    const uid = String(i.data.assignee_id ?? "")
    byPerson.get(uid)?.push({
      status: i.data.status as ContentStatus,
      deadline_ms: tsMs(i.data.deadline),
      started_ms: startedMs.get(i.id) ?? null,
      approved_ms: approvedMs.get(i.id) ?? null,
    })
  }

  const people: PersonPerformanceRow[] = memberUids
    .map((uid) => {
      const rows = byPerson.get(uid) ?? []
      const perf = rows.length
        ? computePersonPerformance(
            rows,
            { from_ms: period.from, to_ms: period.to },
            now
          )
        : { ...EMPTY_PERSON_PERFORMANCE }
      return { user_id: uid, name: names.get(uid) ?? uid, ...perf }
    })
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))

  return { mode, period, people }
}
