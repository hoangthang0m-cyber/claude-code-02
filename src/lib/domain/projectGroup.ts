import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import {
  PROJECT_GROUP_LIFECYCLES,
  type ProjectGroupLifecycle,
} from "@/lib/domain/enums"
import type { Project } from "@/lib/domain/project"

// project-grouping change (design.md Decision 1):
//   ProjectGroup (id, name, description nullable,
//     lifecycle: active | archived, created_by, created_at)
//
// project-group-fields change (design.md Decision 1) adds basic steering info:
//   - `objective` — required when creating a NEW group (legacy groups read it
//     back absent and the roll-up shows a "bổ sung mục tiêu" reminder, task 2.3)
//   - `description` — kept, now playing the "mô tả chi tiết" role
//   - `time_scope_text` — free text, e.g. "3 tháng", "Quý 3/2026"
//   - `target_end_date` — a "YYYY-MM-DD" date, used ONLY to compute the time
//     status ("đang trong hạn / sắp hết hạn / quá hạn"); no start date
//   - `budget_amount` + `budget_currency` — one planned-budget figure and its
//     ISO-4217 currency, entered together or not at all
//
// A group is still NOT a Project: no synced progress link, no retrospective, no
// production state machine, no content items. `created_at` is set server-side;
// `created_by` comes from the verified auth context, never the request body.

export interface ProjectGroup {
  id: string
  name: string
  objective?: string
  description?: string
  time_scope_text?: string
  target_end_date?: string
  budget_amount?: number
  budget_currency?: string
  lifecycle: ProjectGroupLifecycle
  created_by: string
  created_at: Timestamp
}

const groupTargetEndDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày kết thúc dự kiến phải là dạng YYYY-MM-DD")

const budgetCurrency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Đơn vị tiền tệ phải là mã ISO 3 chữ (vd VND, USD)")

const budgetAmount = z.number().positive("Ngân sách dự kiến phải lớn hơn 0")

// The caller-supplied fields of a group. `objective` is required here; the edit
// schema relaxes it with `.partial()` so a manager can add it to a legacy group
// without re-sending every field. `budget_amount` / `budget_currency` are a
// pair — both or neither (a lone currency has nothing to measure).
const projectGroupFields = z.object({
  name: z.string().trim().min(1),
  objective: z.string().trim().min(1, "Cần nhập mục tiêu nhóm"),
  description: z.string().trim().optional(),
  time_scope_text: z.string().trim().min(1).max(200).optional(),
  target_end_date: groupTargetEndDate.optional(),
  budget_amount: budgetAmount.optional(),
  budget_currency: budgetCurrency.optional(),
})

const budgetFieldsPaired = (v: {
  budget_amount?: number
  budget_currency?: string
}) => (v.budget_amount == null) === (v.budget_currency == null)

const budgetPairMessage = {
  message: "Ngân sách dự kiến cần cả số tiền và đơn vị tiền tệ",
  path: ["budget_currency"],
}

// Create (project-group-fields task 1.2): name + objective required; everything
// else optional. lifecycle defaults to "active" server-side; created_by comes
// from auth.
export const projectGroupCreateSchema = projectGroupFields.refine(
  budgetFieldsPaired,
  budgetPairMessage
)

export type ProjectGroupCreate = z.infer<typeof projectGroupCreateSchema>

// Edit — every field optional (so a legacy group can gain just an objective).
// Does NOT carry `lifecycle`: archive / restore has its own validated path
// (task 2.3), mirroring Project.
export const projectGroupUpdateSchema = projectGroupFields
  .partial()
  .refine(budgetFieldsPaired, budgetPairMessage)

export type ProjectGroupUpdate = z.infer<typeof projectGroupUpdateSchema>

// task 2.3 — a legacy group (created before this change) has no objective. The
// roll-up nudges the manager to fill it in but never blocks anything.
export function groupNeedsObjective(
  group: Pick<ProjectGroup, "objective">
): boolean {
  return !group.objective || group.objective.trim().length === 0
}

// task 2.2 / 2.3 — an archived group is read-only (spec: "lưu trữ … chỉ đọc").
// Mirrors `isProjectWritable`.
export function isProjectGroupWritable(
  lifecycle: ProjectGroupLifecycle | string | undefined
): boolean {
  return lifecycle !== "archived"
}

// task 2.3 — archive / restore is a plain active ⇄ archived toggle (no "done"
// state, unlike Project). Its own validated path, separate from name/description.
export const projectGroupLifecycleSchema = z.object({
  lifecycle: z.enum(PROJECT_GROUP_LIFECYCLES),
})

// task 3.1 — set a project's group, or clear it (`null` → "Chưa phân nhóm").
// A single scalar field, so a project can never be in two groups; moving A→B
// just overwrites, and A's membership (a `where group_id == A` query) drops it.
export const projectGroupAssignmentSchema = z.object({
  group_id: z.string().trim().min(1).nullable(),
})

// task 4.5 — reorder within the project's own bucket: `after_id` is the project
// it should follow, or null to move it to the front.
export const projectReorderSchema = z.object({
  after_id: z.string().trim().min(1).nullable(),
})

// ── task 4.1: the grouped project list ──────────────────────────────────────

// A project sorts within its bucket by `sort_index` ascending; a project with
// no index yet (pre-backfill) goes last, then ties break by name.
function byBucketOrder<T extends { sort_index?: number; name: string }>(
  a: T,
  b: T
): number {
  const ai = a.sort_index ?? Number.MAX_SAFE_INTEGER
  const bi = b.sort_index ?? Number.MAX_SAFE_INTEGER
  return ai - bi || a.name.localeCompare(b.name, "vi")
}

export interface ProjectListGroup<T> {
  group: ProjectGroup
  projects: T[]
  count: number
}

export interface GroupedProjectList<T> {
  /** active groups (name order), each with its projects in sort_index order */
  groups: ProjectListGroup<T>[]
  /** projects with no group, in sort_index order */
  ungrouped: { projects: T[]; count: number }
  /** archived groups (only populated when includeArchived) */
  archived: ProjectListGroup<T>[]
}

// task 4.1 — assemble the list screen's shape from the caller's visible projects
// and the groups they can see. Deterministic: groups by name, projects by
// `sort_index`. Empty groups are kept (task 4.4). A project pointing at an
// archived or unknown group is only shown when `includeArchived` (task 2.3:
// archived groups are hidden from the default list, reachable via the filter).
export function groupProjectsForList<
  T extends { id: string; name: string; group_id?: string | null; sort_index?: number },
>(
  projects: readonly T[],
  groups: readonly ProjectGroup[],
  opts: { includeArchived?: boolean } = {}
): GroupedProjectList<T> {
  const includeArchived = opts.includeArchived ?? false

  const active = [...groups]
    .filter((g) => g.lifecycle !== "archived")
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))
  const archivedGroups = [...groups]
    .filter((g) => g.lifecycle === "archived")
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))

  const activeIds = new Set(active.map((g) => g.id))
  const archivedIds = new Set(archivedGroups.map((g) => g.id))

  const buckets = new Map<string, T[]>()
  const ungrouped: T[] = []
  for (const p of projects) {
    const gid = p.group_id ?? null
    if (gid !== null && (activeIds.has(gid) || archivedIds.has(gid))) {
      const list = buckets.get(gid) ?? []
      list.push(p)
      buckets.set(gid, list)
    } else {
      // no group, or a group the caller can't see / that no longer exists
      ungrouped.push(p)
    }
  }

  const block = (g: ProjectGroup): ProjectListGroup<T> => {
    const projects = (buckets.get(g.id) ?? []).sort(byBucketOrder)
    return { group: g, projects, count: projects.length }
  }

  return {
    groups: active.map(block),
    ungrouped: {
      projects: ungrouped.sort(byBucketOrder),
      count: ungrouped.length,
    },
    archived: includeArchived ? archivedGroups.map(block) : [],
  }
}

// task 1.2 — the bucket a project belongs to. A project doc written before this
// change has no `group_id`, so it reads back as `null` ("Chưa phân nhóm"). One
// shared normalizer, reused by list-grouping (task 4.1) and sort ordering
// (task 3.2) so "ungrouped" is decided in exactly one place.
export function projectGroupId(
  project: Pick<Project, "group_id">
): string | null {
  return project.group_id ?? null
}

// task 1.3 — spacing between adjacent `sort_index` values, so a drag can insert
// a project between two neighbours (task 4.5) without reindexing the whole
// bucket every time.
export const SORT_INDEX_STEP = 100

// task 3.2 — the `sort_index` for a project appended to the END of a bucket:
// one step past the bucket's current max (or the first step if empty). Used on
// create (task 3.3) and on assign / move (task 3.2).
export function nextSortIndex(bucketIndices: readonly number[]): number {
  const max = bucketIndices.reduce((m, n) => (n > m ? n : m), 0)
  return max + SORT_INDEX_STEP
}

// task 4.5 — move `movedId` to sit right after `afterId` (or to the front when
// `afterId` is null) within its bucket, and return the `sort_index` writes.
// `bucket` is the bucket's CURRENT order (any order in — it is sorted here by
// sort_index, ties by id). Normally only one write: the midpoint between the
// two new neighbours. When the neighbours are adjacent integers (no gap left),
// the whole bucket is re-spaced to 100·1, 100·2, … and every changed row is
// returned. Idempotent-ish: dropping an item where it already is yields no-ops
// filtered out, so the map only carries real changes.
export function computeReorder(
  bucket: readonly { id: string; sort_index?: number }[],
  movedId: string,
  afterId: string | null
): Map<string, number> {
  const ordered = [...bucket].sort(
    (a, b) =>
      (a.sort_index ?? Number.MAX_SAFE_INTEGER) -
        (b.sort_index ?? Number.MAX_SAFE_INTEGER) || (a.id < b.id ? -1 : 1)
  )
  const rest = ordered.filter((p) => p.id !== movedId)
  const pos = afterId === null ? 0 : rest.findIndex((p) => p.id === afterId) + 1

  const prev = pos > 0 ? (rest[pos - 1].sort_index ?? 0) : 0
  const nextNeighbour = rest[pos]?.sort_index
  const next =
    typeof nextNeighbour === "number" ? nextNeighbour : prev + 2 * SORT_INDEX_STEP

  if (next - prev >= 2) {
    const mid = Math.floor((prev + next) / 2)
    const current = ordered.find((p) => p.id === movedId)?.sort_index
    return current === mid ? new Map() : new Map([[movedId, mid]])
  }

  // no gap — re-space the whole bucket
  const finalOrder = [
    ...rest.slice(0, pos).map((p) => p.id),
    movedId,
    ...rest.slice(pos).map((p) => p.id),
  ]
  const out = new Map<string, number>()
  const currentIndex = new Map(ordered.map((p) => [p.id, p.sort_index]))
  finalOrder.forEach((id, i) => {
    const value = (i + 1) * SORT_INDEX_STEP
    if (currentIndex.get(id) !== value) out.set(id, value)
  })
  return out
}

// task 1.3 — backfill `sort_index` for projects that lack one. Within each
// bucket (a `group_id` value, or the group_id-less bucket) the un-indexed
// projects are appended after the bucket's current max, in `created_at` order
// (id breaks ties), gapped by SORT_INDEX_STEP. Returns id → new sort_index only
// for the projects it assigns; a project that already has `sort_index` keeps it
// and is not in the result. Idempotent: re-running only places any newly
// un-indexed project at the end of its bucket, never disturbing existing order
// (same "goes to the end of the new bucket" rule as task 3.2).
export function computeSortIndexBackfill(
  projects: ReadonlyArray<{
    id: string
    group_id?: string | null
    created_ms: number
    sort_index?: number
  }>
): Map<string, number> {
  const buckets = new Map<
    string | null,
    { indexed: number[]; pending: { id: string; created_ms: number }[] }
  >()
  for (const p of projects) {
    const key = p.group_id ?? null
    const b = buckets.get(key) ?? { indexed: [], pending: [] }
    if (typeof p.sort_index === "number") b.indexed.push(p.sort_index)
    else b.pending.push({ id: p.id, created_ms: p.created_ms })
    buckets.set(key, b)
  }

  const out = new Map<string, number>()
  for (const { indexed, pending } of buckets.values()) {
    const start = indexed.length ? Math.max(...indexed) : 0
    pending
      .sort((a, b) => a.created_ms - b.created_ms || (a.id < b.id ? -1 : 1))
      .forEach((p, i) => out.set(p.id, start + (i + 1) * SORT_INDEX_STEP))
  }
  return out
}
