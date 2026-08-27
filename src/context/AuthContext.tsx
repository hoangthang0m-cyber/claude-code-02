"use client"

import * as React from "react"
import { onAuthStateChanged, type User } from "firebase/auth"

import { auth } from "@/firebase/config"
import { subscribeToUser, upsertUserProfile } from "@/services/users.service"
import type { AppUser } from "@/types/user"

type AuthContextValue = {
  /** Firebase auth user (identity). */
  user: User | null
  /** users/ profile document, incl. `system_role` (SPEC §6.1). */
  profile: AppUser | null
  /** True until the initial auth state has resolved. */
  loading: boolean
}

const AuthContext = React.createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [profile, setProfile] = React.useState<AppUser | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
      if (nextUser) {
        upsertUserProfile(nextUser).catch(() => undefined)
      }
    })
  }, [])

  React.useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeToUser(user.uid, setProfile)
    return () => {
      unsubscribe()
      setProfile(null)
    }
  }, [user])

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return React.useContext(AuthContext)
}
