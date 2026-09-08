"use client"

import { useAuth } from "@/context/AuthContext"

// The calendar's two-role check (Mục D task 11.3 formalises this). Role comes
// from the `users` doc `system_role`, which the members sync mirrors into
// `members/{uid}.role` — same value either way.
export function usePermissions() {
  const { profile, loading } = useAuth()
  const isManager = profile?.system_role === "manager"
  return {
    uid: profile?.id ?? null,
    isManager,
    isStaff: !!profile && !isManager,
    loading,
  }
}
