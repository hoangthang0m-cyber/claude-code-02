import type { SystemRole } from "@/lib/domain/enums"

export type { SystemRole }

// App-level user profile, stored in the `users` collection. Extends SPEC §6.1's
// User (id, name, email, system_role) with the avatar URL from the auth
// provider.
export interface AppUser {
  id: string
  name: string
  email: string
  system_role: SystemRole
  avatar?: string
}
