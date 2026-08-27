import { z } from "zod"

import {
  PROJECT_ROLES,
  SKILL_TAGS,
  type ProjectRole,
  type SkillTag,
} from "@/lib/domain/enums"
import { idString } from "@/lib/domain/shared"

// SPEC §6.1: ProjectMember (id, project_id, user_id,
//   project_role: manager | staff, skill_tag: content | ads | null)

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  project_role: ProjectRole
  skill_tag: SkillTag | null
}

// Add a member (SPEC §5.1 R4): project_id comes from the URL, not the body.
export const projectMemberAddSchema = z.object({
  user_id: idString,
  project_role: z.enum(PROJECT_ROLES),
  // Explicitly nullable per §6.1 (optional label).
  skill_tag: z.enum(SKILL_TAGS).nullable().default(null),
})

export type ProjectMemberAdd = z.infer<typeof projectMemberAddSchema>

// Change a member's role or skill tag (SPEC §5.1 R4). Both optional.
export const projectMemberUpdateSchema = z.object({
  project_role: z.enum(PROJECT_ROLES).optional(),
  skill_tag: z.enum(SKILL_TAGS).nullable().optional(),
})

export type ProjectMemberUpdate = z.infer<typeof projectMemberUpdateSchema>
