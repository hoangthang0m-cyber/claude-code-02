import { z } from "zod"

import { SYSTEM_ROLES, type SystemRole } from "@/lib/domain/enums"

// SPEC §6.1: User (id, name, email, system_role: manager | staff)

export interface User {
  id: string
  name: string
  email: string
  system_role: SystemRole
}

export const userWriteSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  system_role: z.enum(SYSTEM_ROLES),
})

export type UserWrite = z.infer<typeof userWriteSchema>
