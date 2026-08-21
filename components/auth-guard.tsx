"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { onAuthStateChanged } from "firebase/auth"

import { auth } from "@/lib/firebase"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [isChecking, setIsChecking] = React.useState(true)

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login")
        return
      }
      setIsChecking(false)
    })
    return unsubscribe
  }, [router])

  if (isChecking) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Đang kiểm tra đăng nhập...</p>
      </div>
    )
  }

  return <>{children}</>
}
