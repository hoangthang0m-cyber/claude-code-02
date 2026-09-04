import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import { type ProjectGroupLifecycle } from "@/lib/domain/enums"
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

// task 1.2 — the bucket a project belongs to. A project doc written before this
// change has no `group_id`, so it reads back as `null` ("Chưa phân nhóm"). One
// shared normalizer, reused by list-grouping (task 4.1) and sort ordering
// (task 3.2) so "ungrouped" is decided in exactly one place.
export function projectGroupId(
  project: Pick<Project, "group_id">
): string | null {
  return project.group_id ?? null
}
