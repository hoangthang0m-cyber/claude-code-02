"use client"

import * as React from "react"
import { collection, doc, onSnapshot, query, where } from "firebase/firestore"

import { useAuth } from "@/context/AuthContext"
import { db } from "@/firebase/config"
import { COLLECTIONS, type Project, type ProjectRole } from "@/lib/domain"

export interface MyProject extends Project {
  my_role: ProjectRole
}

// Reads scoped to membership (firestore.rules): subscribe to the caller's
// projectMembers docs, then to each referenced project.
export function useMyProjects() {
  const { user } = useAuth()
  const [projects, setProjects] = React.useState<MyProject[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!user) return

    const perProject = new Map<string, () => void>()
    const data = new Map<string, MyProject>()
    const roles = new Map<string, ProjectRole>()

    const emit = () =>
      setProjects(
        [...data.values()].sort((a, b) =>
          (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0)
        )
      )

    const unsubMemberships = onSnapshot(
      query(
        collection(db, COLLECTIONS.projectMembers),
        where("user_id", "==", user.uid)
      ),
      (snap) => {
        const next = new Set<string>()
        snap.forEach((m) => {
          const row = m.data() as { project_id: string; project_role: ProjectRole }
          next.add(row.project_id)
          roles.set(row.project_id, row.project_role)
          const existing = data.get(row.project_id)
          if (existing) data.set(row.project_id, { ...existing, my_role: row.project_role })
        })

        for (const [pid, unsub] of perProject) {
          if (!next.has(pid)) {
            unsub()
            perProject.delete(pid)
            data.delete(pid)
            roles.delete(pid)
          }
        }

        for (const pid of next) {
          if (perProject.has(pid)) continue
          perProject.set(
            pid,
            onSnapshot(
              doc(db, COLLECTIONS.projects, pid),
              (p) => {
                if (p.exists()) {
                  data.set(pid, {
                    id: p.id,
                    ...(p.data() as Omit<Project, "id">),
                    my_role: roles.get(pid) ?? "staff",
                  })
                } else {
                  data.delete(pid)
                }
                emit()
              },
              (e) => setError(e.message)
            )
          )
        }
        emit()
      },
      (e) => {
        setProjects([])
        setError(e.message)
      }
    )

    return () => {
      unsubMemberships()
      perProject.forEach((u) => u())
    }
  }, [user])

  return { projects, loading: projects === null, error }
}
