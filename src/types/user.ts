export type UserRole = "admin" | "manager" | "developer"

export interface AppUser {
  id: string
  name: string
  email: string
  role: UserRole
  avatar?: string
}
