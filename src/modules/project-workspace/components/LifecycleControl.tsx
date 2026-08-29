"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  PROJECT_LIFECYCLE_LABELS,
  PROJECT_LIFECYCLE_TRANSITIONS,
  type Project,
} from "@/lib/domain"
import { changeLifecycle } from "@/modules/project-workspace/services/projects.client"
import { Button } from "@/components/ui/button"

export function LifecycleControl({
  project,
  canManage,
}: {
  project: Project
  canManage: boolean
}) {
  const [busy, setBusy] = React.useState(false)
  const targets = PROJECT_LIFECYCLE_TRANSITIONS[project.lifecycle]

  if (!canManage || targets.length === 0) return null

  async function go(target: (typeof targets)[number]) {
    setBusy(true)
    try {
      const res = await changeLifecycle(project.id, target)
      toast.success(`Đã chuyển sang “${PROJECT_LIFECYCLE_LABELS[target]}”`)
      if (res.retrospective_reminder) {
        toast.warning("Dự án đã hoàn thành — nhớ điền phần “Đúc kết sau dự án”.")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không chuyển được")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Chuyển trạng thái:</span>
      {targets.map((t) => (
        <Button
          key={t}
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => go(t)}
        >
          {PROJECT_LIFECYCLE_LABELS[t]}
        </Button>
      ))}
    </div>
  )
}
