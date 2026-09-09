import type { ReactNode } from "react"
import Link from "next/link"

import { PROJECT_LIFECYCLE_LABELS, PROJECT_ROLE_LABELS } from "@/lib/domain"
import type { MyProject } from "@/modules/project-workspace/hooks/useMyProjects"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const LIFECYCLE_VARIANT: Record<
  MyProject["lifecycle"],
  "default" | "secondary" | "outline"
> = {
  running: "default",
  done: "secondary",
  archived: "outline",
}

// `actions` is an optional control cluster (drag handle, ⋮ menu…). It lives in
// the header next to the status badge — a real layout cell, not an absolute
// overlay — so it never sits on top of the title or the badge. A single
// full-card <Link> overlay keeps the whole card clickable while the actions,
// raised above it, handle their own clicks.
export function ProjectCard({
  project,
  actions,
}: {
  project: MyProject
  actions?: ReactNode
}) {
  return (
    <Card className="relative h-full transition-shadow hover:ring-primary/40 hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.4)]">
      <Link
        href={`/campaigns/${project.id}`}
        aria-label={project.name}
        className="absolute inset-0 z-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2">{project.name}</CardTitle>
          <div className="relative z-10 flex shrink-0 items-center gap-1">
            <Badge variant={LIFECYCLE_VARIANT[project.lifecycle]}>
              {PROJECT_LIFECYCLE_LABELS[project.lifecycle]}
            </Badge>
            {actions}
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-0 flex flex-col gap-2">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {project.objective}
        </p>
        <span className="text-xs text-muted-foreground">
          Vai trò của bạn: {PROJECT_ROLE_LABELS[project.my_role]}
        </span>
      </CardContent>
    </Card>
  )
}
