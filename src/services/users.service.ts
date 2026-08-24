import { doc, getDoc, orderBy, setDoc } from "firebase/firestore"
import type { User } from "firebase/auth"

import { db } from "@/firebase/config"
import { subscribeToCollection } from "@/services/firestore.service"
import type { AppUser } from "@/types/user"

const COLLECTION = "users"

export function subscribeToUsers(onChange: (users: AppUser[]) => void) {
  return subscribeToCollection<AppUser>(COLLECTION, onChange, [orderBy("name")])
}

export async function upsertUserProfile(user: User) {
  const userRef = doc(db, COLLECTION, user.uid)
  const existing = await getDoc(userRef)

  const profile: Omit<AppUser, "id" | "role"> & { role?: AppUser["role"] } = {
    name: user.displayName || user.email?.split("@")[0] || "Người dùng",
    email: user.email ?? "",
    avatar: user.photoURL ?? "",
  }

  if (!existing.exists()) {
    profile.role = "developer"
  }

  await setDoc(userRef, profile, { merge: true })
}
