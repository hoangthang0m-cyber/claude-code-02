"use client"

import * as React from "react"
import { onAuthStateChanged, type User } from "firebase/auth"

import { auth } from "@/firebase/config"
import { syncSelfMember } from "@/modules/team-calendar/services/members.client"
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
  // onAuthStateChanged also fires on hourly token refresh — only sync the
  // calendar member doc once per signed-in uid.
  const syncedMemberUid = React.useRef<string | null>(null)

  React.useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
      if (nextUser) {
        const profileWritten = upsertUserProfile(nextUser).catch(() => undefined)
        if (syncedMemberUid.current !== nextUser.uid) {
          syncedMemberUid.current = nextUser.uid
          // after the users/ doc lands, mirror it into members/{uid}
          profileWritten.then(() => syncSelfMember()).catch(() => undefined)
        }
      } else {
        syncedMemberUid.current = null
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
