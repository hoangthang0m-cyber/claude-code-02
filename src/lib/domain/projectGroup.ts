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
// A plain folder over Project — deliberately WITHOUT the Project form fields
// (objective, scale, progress_sheet_url, retrospective) so a group can never be
// mistaken for a project. `created_at` is set server-side; `created_by` comes
// from the verified auth context, never the request body.

export interface ProjectGroup {
  id: string
  name: string
  description?: string
  lifecycle: ProjectGroupLifecycle
  created_by: string
  created_at: Timestamp
}

// Create (spec: name required, description optional). lifecycle defaults to
// "active" server-side; created_by comes from auth.
export const projectGroupCreateSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
})

export type ProjectGroupCreate = z.infer<typeof projectGroupCreateSchema>

// Edit (spec: "chỉnh sửa hai trường này sau khi tạo") — name and description
// only, both optional. Does NOT carry `lifecycle`: archive / restore has its
// own validated path (task 2.3), mirroring Project.
export const projectGroupUpdateSchema = projectGroupCreateSchema.partial()

export type ProjectGroupUpdate = z.infer<typeof projectGroupUpdateSchema>

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
