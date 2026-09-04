import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import { PROJECT_LIFECYCLES, type ProjectLifecycle } from "@/lib/domain/enums"
import { looseLinkString } from "@/lib/domain/shared"

// SPEC §6.1: Project (id, name, objective, description, scale,
//   progress_sheet_url nullable, retrospective nullable,
//   lifecycle: running | done | archived, created_by)
//
// created_at / updated_at follow the ContentItem convention in §6.1 and are set
// server-side. updated_by is required by SPEC §5.1 R2 ("lưu kèm thời điểm +
// người cập nhật") — the §6.1 sketch omits it.

export interface Project {
  id: string
  name: string
  objective: string
  description?: string
  scale?: string
  progress_sheet_url?: string
  retrospective?: string
  lifecycle: ProjectLifecycle
  created_by: string
  created_at: Timestamp
  updated_at: Timestamp
  updated_by?: string
  // project-grouping change task 1.2 — the folder this project sits in, or
  // absent/null for "Chưa phân nhóm". Not a form field: it is set only via the
  // assign-to-group path (task 3.1). Deleting a group clears it (task 2.4).
  group_id?: string | null
  // project-grouping change task 1.3 — manual order within its bucket (one
  // group_id value, or the group_id-less bucket). Backfilled by created_at with
  // a gap of SORT_INDEX_STEP; absent only until the backfill script runs.
  sort_index?: number
}

// Create: name + objective required (SPEC §5.1 R1). lifecycle defaults to
// "running"; created_by comes from the auth context.
export const projectCreateSchema = z.object({
  name: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  description: z.string().trim().optional(),
  scale: z.string().trim().optional(),
  // Stored even if not a usable Sheets URL (SPEC §5.1 R1) — validated downstream.
  progress_sheet_url: looseLinkString.optional(),
  retrospective: z.string().trim().optional(),
  // project-grouping change task 3.3 — optional group picker on the create form.
  // Omitted → "Chưa phân nhóm". The edit form (projectFormUpdateSchema) does NOT
  // carry it: moving a project between groups has its own path (task 3.1).
  group_id: z.string().trim().min(1).optional(),
})

export type ProjectCreate = z.infer<typeof projectCreateSchema>

// Edit the standard form (SPEC §5.1 R2): every field optional. Does NOT include
// `lifecycle` — lifecycle transitions have their own validated path (§5.1 R3) —
// nor `group_id` — moving a project between groups is PATCH .../group
// (project-grouping task 3.1).
export const projectFormUpdateSchema = projectCreateSchema
  .omit({ group_id: true })
  .partial()

export type ProjectFormUpdate = z.infer<typeof projectFormUpdateSchema>

// ── Lifecycle (SPEC §5.1 R3) ────────────────────────────────────────────────

export const projectLifecycleSchema = z.object({
  lifecycle: z.enum(PROJECT_LIFECYCLES),
})

// Hard delete (user-approved 2026-09-04; NOT in SPEC.md — §5.1 R3 stops at
// "archived"). The caller must echo the project's exact name so a click can't
// nuke a project with all its content, history, comments and ads data.
export const projectDeleteSchema = z.object({
  confirm_name: z.string().trim().min(1),
})

// running → done → archived is the forward path; done can reopen to running, and
// an archived project can be restored to running.
export const PROJECT_LIFECYCLE_TRANSITIONS: Record<
  ProjectLifecycle,
  readonly ProjectLifecycle[]
> = {
  running: ["done", "archived"],
  done: ["running", "archived"],
  archived: ["running"],
}

export function canChangeLifecycle(
  from: ProjectLifecycle,
  to: ProjectLifecycle
): boolean {
  return PROJECT_LIFECYCLE_TRANSITIONS[from].includes(to)
}

// SPEC §5.1 R3: an archived project is read-only.
export function isProjectWritable(lifecycle: ProjectLifecycle): boolean {
  return lifecycle !== "archived"
}

// SPEC §6.3: background sync runs for `running` projects; §5.1 R3: archiving
// stops all background sync. Whether a `done` project keeps syncing Ads is
// Open Question Q5 (§8) — treated as inactive until answered.
export function isBackgroundSyncActive(lifecycle: ProjectLifecycle): boolean {
  return lifecycle === "running"
}
