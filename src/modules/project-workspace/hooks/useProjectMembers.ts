"use client"

import * as React from "react"

import { authedJson } from "@/lib/api/authedFetch"
import type { ProjectMember } from "@/lib/domain"

// Fetched from GET /api/projects/[id]/members — not a client Firestore query,
// because listing a project's members needs a membership check that can't be a
// Firestore list rule (see firestore.rules). Call refresh() after a mutation.
export function useProjectMembers(projectId: string | undefined) {
  const [members, setMembers] = React.useState<ProjectMember[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    authedJson<{ members: ProjectMember[] }>(`/api/projects/${projectId}/members`)
      .then((r) => {
        if (cancelled) return
        setMembers(r.members)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setMembers([])
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [projectId, tick])

  return {
    members,
    loading: members === null,
    error,
    refresh: () => setTick((t) => t + 1),
  }
}
