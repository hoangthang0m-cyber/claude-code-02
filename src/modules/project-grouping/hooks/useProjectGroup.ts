"use client"

import * as React from "react"
import { doc, onSnapshot } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import { COLLECTIONS, type ProjectGroup } from "@/lib/domain"

// Client read of a single project group (firestore.rules: any signed-in user
// reads projectGroups). Used by the roll-up page for the "Thông tin nhóm" block
// (project-group-fields task 3.1) and the "bổ sung mục tiêu" reminder (task 2.3).
export function useProjectGroup(groupId: string) {
  const { user } = useAuth()
  const [group, setGroup] = React.useState<ProjectGroup | null>(null)
  const [missing, setMissing] = React.useState(false)

  React.useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      doc(db, COLLECTIONS.projectGroups, groupId),
      (snap) => {
        if (snap.exists()) {
          setGroup({ id: snap.id, ...(snap.data() as Omit<ProjectGroup, "id">) })
          setMissing(false)
        } else {
          setGroup(null)
          setMissing(true)
        }
      },
      () => {
        setGroup(null)
        setMissing(false)
      }
    )
    return unsub
  }, [user, groupId])

  return { group, loading: group === null && !missing, missing }
}
