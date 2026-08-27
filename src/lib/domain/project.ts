import type { Timestamp } from "firebase/firestore"
import { z } from "zod"

import {
  PROJECT_LIFECYCLES,
  type ProjectLifecycle,
} from "@/lib/domain/enums"
import { looseLinkString } from "@/lib/domain/shared"

// SPEC §6.1: Project (id, name, objective, description, scale,
//   progress_sheet_url nullable, retrospective nullable,
//   lifecycle: running | done | archived, created_by)
//
// created_at / updated_at follow the ContentItem convention in §6.1 and are set
// server-side.

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
})

export type ProjectCreate = z.infer<typeof projectCreateSchema>

// Edit: every form field editable after creation (SPEC §5.1 R2), all optional.
export const projectUpdateSchema = projectCreateSchema.partial().extend({
  lifecycle: z.enum(PROJECT_LIFECYCLES).optional(),
})

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>
