"use client"

import * as React from "react"
import { collection, onSnapshot, query } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import { COLLECTIONS, type KnowledgeEntry } from "@/lib/domain"

const ms = (v: unknown) =>
  (v as { toMillis?: () => number })?.toMillis?.() ?? 0

// Client read (firestore.rules: any signed-in user reads knowledgeEntries).
// Archived entries are hidden unless `includeArchived`; sorted by `updated_at`
// descending (design.md Decision 6).
export function useKnowledgeEntries(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false
  const { user } = useAuth()
  const [entries, setEntries] = React.useState<KnowledgeEntry[] | null>(null)

  React.useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      query(collection(db, COLLECTIONS.knowledgeEntries)),
      (snap) => {
        const rows = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<KnowledgeEntry, "id">) })
        )
        setEntries(
          rows
            .filter((e) => includeArchived || e.lifecycle !== "archived")
            .sort((a, b) => ms(b.updated_at) - ms(a.updated_at))
        )
      },
      () => setEntries([])
    )
    return unsub
  }, [user, includeArchived])

  return { entries: entries ?? [], loading: entries === null }
}
