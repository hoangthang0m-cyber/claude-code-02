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

export const projectMemberWriteSchema = z.object({
  project_id: idString,
  user_id: idString,
  project_role: z.enum(PROJECT_ROLES),
  // Explicitly nullable per §6.1 (optional label).
  skill_tag: z.enum(SKILL_TAGS).nullable().default(null),
})

export type ProjectMemberWrite = z.infer<typeof projectMemberWriteSchema>
