"use client"

import * as React from "react"
import { collection, onSnapshot, query } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import { COLLECTIONS, type ProjectGroup } from "@/lib/domain"

// Client read (firestore.rules: any signed-in user reads projectGroups).
// Archived groups are filtered out unless `includeArchived`. Sorted by name.
export function useProjectGroups(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false
  const { user } = useAuth()
  const [groups, setGroups] = React.useState<ProjectGroup[] | null>(null)

  React.useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      query(collection(db, COLLECTIONS.projectGroups)),
      (snap) => {
        const rows = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<ProjectGroup, "id">) })
        )
        setGroups(
          rows
            .filter((g) => includeArchived || g.lifecycle !== "archived")
            .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        )
      },
      () => setGroups([])
    )
    return unsub
  }, [user, includeArchived])

  return { groups: groups ?? [], loading: groups === null }
}
