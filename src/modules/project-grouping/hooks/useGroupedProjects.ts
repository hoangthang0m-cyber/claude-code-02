"use client"

import * as React from "react"

import { groupProjectsForList } from "@/lib/domain"
import { useProjectGroups } from "@/modules/project-grouping/hooks/useProjectGroups"
import {
  useMyProjects,
  type MyProject,
} from "@/modules/project-workspace/hooks/useMyProjects"

// task 4.1 — the grouped project list, assembled on the client from the two
// realtime reads (memberships → projects, and projectGroups) so the list keeps
// updating live. `groupProjectsForList` (pure, unit-tested) owns the structure
// and ordering.
export function useGroupedProjects(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false
  const { projects, loading: pLoading, error } = useMyProjects()
  // fetch every group (incl. archived); the pure fn decides what to show
  const { groups, loading: gLoading } = useProjectGroups({ includeArchived: true })

  const grouped = React.useMemo(
    () => groupProjectsForList<MyProject>(projects ?? [], groups, { includeArchived }),
    [projects, groups, includeArchived]
  )

  return { grouped, loading: pLoading || gLoading, error }
}
