"use client"

import { CalendarOffIcon } from "lucide-react"

import { useAuth } from "@/context/AuthContext"
import { useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"

// Mục B `calendar-access-control` — "Tài khoản không thuộc phòng marketing":
// a signed-in user who is not an active `members/{uid}` sees a "no access"
// screen instead of the calendar (task 11.2). Sign-in itself is handled one
// level up by the shared AuthGuard (task 11.1); by the time this renders the
// user is authenticated.
//
// `members` here is the active-only directory (the provider queries
// `where("active","==",true)`), and a non-member's read of it is denied by
// Security Rules and surfaces as an empty list — so "uid not in the directory"
// covers both "left the team" and "never was on it".
export function CalendarAccessGate({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = useAuth()
  const { byUid, loading } = useMembers()

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <p className="text-sm text-muted-foreground">Đang tải lịch đội…</p>
      </div>
    )
  }

  if (!user || !byUid.has(user.uid)) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3 p-6 text-center">
        <CalendarOffIcon className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Bạn không có quyền vào lịch đội</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Lịch hoạt động chỉ dành cho thành viên đội marketing. Nếu bạn cho rằng
          đây là nhầm lẫn, hãy nhờ Trưởng phòng thêm tài khoản của bạn vào danh
          bạ đội.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
