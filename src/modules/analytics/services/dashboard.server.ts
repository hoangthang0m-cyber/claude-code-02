import {
  COLLECTIONS,
  computeProgressDashboard,
  EMPTY_PROGRESS_DASHBOARD,
  type ContentStatus,
  type DashboardItemInput,
  type ProgressDashboard,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import { getAdminDb } from "@/lib/server/firebaseAdmin"
import {
  pickCurrentMetric,
  toMetricView,
} from "@/modules/ads-performance/services/adsMetrics.server"
import {
  chunkedIn,
  resolveAnalyticsScope,
  scopedView,
  type ScopedView,
} from "@/modules/analytics/services/scope.server"

// SPEC §5.6 R1, task 8.1: the live progress dashboard.
//
// A project manager sees the six counters over every project they manage
// (`mode: "manager"`). Anyone else sees the same counters but only over the
// content items assigned to them (`mode: "staff"`, SPEC §5.6 R1 bullet 3 — no
// project/dept dashboard). The per-role hard limit is task 8.7; this endpoint
// already scopes the data.

export interface ProgressDashboardResult extends ProgressDashboard {
  mode: "manager" | "staff"
  project_ids: string[]
  as_of: number
}

function tsMs(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | undefined
  return typeof t?.toMillis === "function" ? t.toMillis() : null
}

// task 1.4 — the aggregation core: the six counters over an explicit
// project-id set. `getProgressDashboard` (project-level) and the group roll-up
// (task 5.1) are thin wrappers that resolve their own set and call this.
export async function progressDashboardForScope(
  scope: ScopedView
): Promise<ProgressDashboardResult> {
  const db = getAdminDb()
  const { mode, project_ids, uid } = scope

  if (project_ids.length === 0) {
    return {
      ...EMPTY_PROGRESS_DASHBOARD,
      mode,
      project_ids: [],
      as_of: Date.now(),
    }
  }

  const itemDocs = await chunkedIn(project_ids, async (batch) => {
    const snap = await db
      .collection(COLLECTIONS.contentItems)
      .where("project_id", "in", batch)
      .get()
    return snap.docs
  })
  const items = itemDocs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((i) => (mode === "manager" ? true : i.data.assignee_id === uid))

  const activeAdItemIds = await currentlyRunningAdItemIds(
    db,
    items.map((i) => i.id)
  )

  const now = Date.now()
  const rowsForDash: DashboardItemInput[] = items.map((i) => ({
    status: i.data.status as ContentStatus,
    deadline_ms: tsMs(i.data.deadline),
    ads_active: activeAdItemIds.has(i.id),
  }))

  return {
    ...computeProgressDashboard(rowsForDash, now),
    mode,
    project_ids,
    as_of: now,
  }
}

export async function getProgressDashboard(
  actor: AuthedUser
): Promise<ProgressDashboardResult> {
  return progressDashboardForScope(
    scopedView(await resolveAnalyticsScope(actor), actor.uid)
  )
}

// content items whose current AdsMetric (latest synced, else latest manual —
// §6.1) is delivering.
async function currentlyRunningAdItemIds(
  db: ReturnType<typeof getAdminDb>,
  itemIds: string[]
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set()

  const byItem = new Map<string, ReturnType<typeof toMetricView>[]>()
  const metricDocs = await chunkedIn(itemIds, async (batch) => {
    const snap = await db
      .collection(COLLECTIONS.adsMetrics)
      .where("content_item_id", "in", batch)
      .get()
    return snap.docs
  })
  for (const d of metricDocs) {
    const key = String(d.data().content_item_id ?? "")
    if (!key) continue
    const list = byItem.get(key) ?? []
    list.push(toMetricView(d.id, d.data()))
    byItem.set(key, list)
  }

  const running = new Set<string>()
  for (const [id, metrics] of byItem) {
    if (pickCurrentMetric(metrics)?.delivery_status === "active") running.add(id)
  }
  return running
}
