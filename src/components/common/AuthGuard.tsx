"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { useAuth } from "@/context/AuthContext"

// Where a fresh sign-in should land the user — the deep link they were denied
// (Mục B `calendar-access-control` "Truy cập khi chưa đăng nhập"). LoginForm
// reads and clears it after auth; a plain visit to /login never sets it.
export const POST_LOGIN_REDIRECT_KEY = "auth:postLoginRedirect"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()

  React.useEffect(() => {
    if (!loading && !user) {
      try {
        if (pathname && pathname !== "/login") {
          sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, pathname)
        }
      } catch {
        /* private mode — fall back to the default landing route */
      }
      router.replace("/login")
    }
  }, [loading, user, router, pathname])

  if (loading || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Đang kiểm tra đăng nhập...</p>
      </div>
    )
  }

  return <>{children}</>
}
