"use client"

import { useAuth } from "@/context/AuthContext"
import { useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"

// The calendar's two-role check (Mục D task 11.3). Role comes from
// `members/{uid}.role` — the mirror the calendar owns and its Security Rules
// read — NOT the caller's global `users.system_role`. The two hold the same
// value (the member sync copies it), but reading `members` ties "has a role" to
// "is a member": a non-member resolves to no permissions.
export function usePermissions() {
  const { user, loading: authLoading } = useAuth()
  const { byUid, loading: membersLoading } = useMembers()

  const uid = user?.uid ?? null
  const member = uid ? byUid.get(uid) : undefined
  const isManager = member?.role === "manager"

  return {
    uid,
    isManager,
    isStaff: !!member && !isManager,
    isMember: !!member,
    loading: authLoading || membersLoading,
  }
}
