"use client"

import * as React from "react"
import { doc, onSnapshot } from "firebase/firestore"

import { db } from "@/firebase/config"
import { COLLECTIONS, type Project } from "@/lib/domain"

type State = {
  project: Project | null
  loading: boolean
  error: string | null
}

export function useProject(projectId: string | undefined) {
  const [state, setState] = React.useState<State>({
    project: null,
    loading: true,
    error: null,
  })

  React.useEffect(() => {
    if (!projectId) return
    return onSnapshot(
      doc(db, COLLECTIONS.projects, projectId),
      (snap) =>
        setState({
          project: snap.exists()
            ? { id: snap.id, ...(snap.data() as Omit<Project, "id">) }
            : null,
          loading: false,
          error: null,
        }),
      (e) => setState({ project: null, loading: false, error: e.message })
    )
  }, [projectId])

  return state
}
