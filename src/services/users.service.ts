import {
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  setDoc,
  type FirestoreError,
} from "firebase/firestore"
import type { User } from "firebase/auth"

import { db } from "@/firebase/config"
import { subscribeToCollection } from "@/services/firestore.service"
import type { AppUser } from "@/types/user"

const COLLECTION = "users"

export function subscribeToUsers(
  onChange: (users: AppUser[]) => void,
  onError?: (error: FirestoreError) => void
) {
  return subscribeToCollection<AppUser>(COLLECTION, onChange, [orderBy("name")], onError)
}

export function subscribeToUser(
  uid: string,
  onChange: (user: AppUser | null) => void,
  onError?: (error: FirestoreError) => void
) {
  return onSnapshot(
    doc(db, COLLECTION, uid),
    (snap) => {
      onChange(
        snap.exists()
          ? ({ id: snap.id, ...(snap.data() as Omit<AppUser, "id">) })
          : null
      )
    },
    onError
  )
}

// Called on every login. Creates the users/ doc on first sign-in with the
// least-privileged role (SPEC §6.1 system_role: manager | staff); task 1.6
// promotes the seeded account to manager. `system_role` is never overwritten on
// later logins.
export async function upsertUserProfile(user: User) {
  const userRef = doc(db, COLLECTION, user.uid)
  const existing = await getDoc(userRef)

  const profile: Omit<AppUser, "id" | "system_role"> & {
    system_role?: AppUser["system_role"]
  } = {
    name: user.displayName || user.email?.split("@")[0] || "Người dùng",
    email: user.email ?? "",
    avatar: user.photoURL ?? "",
  }

  if (!existing.exists()) {
    profile.system_role = "staff"
  }

  await setDoc(userRef, profile, { merge: true })
}
