"use client"

import * as React from "react"
import { doc, onSnapshot } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import { COLLECTIONS, projectMemberDocId, type ProjectRole } from "@/lib/domain"

// The caller's role in one project. Reads the single deterministic membership
// doc (allowed by the `get` rule); undefined = loading, null = not a member.
export function useMyProjectRole(
  projectId: string | undefined
): ProjectRole | null | undefined {
  const { user } = useAuth()
  const [role, setRole] = React.useState<ProjectRole | null | undefined>(
    undefined
  )

  React.useEffect(() => {
    if (!projectId || !user) return
    return onSnapshot(
      doc(db, COLLECTIONS.projectMembers, projectMemberDocId(projectId, user.uid)),
      (snap) =>
        setRole(
          snap.exists()
            ? ((snap.data().project_role as ProjectRole) ?? "staff")
            : null
        ),
      () => setRole(null)
    )
  }, [projectId, user])

  return role
}
