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
    <Card className="mystic-lift relative h-full hover:ring-primary/40">
      <Link
        href={`/campaigns/${project.id}`}
        aria-label={project.name}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      {/* nét sáng chạy dọc mép trên khi rê chuột */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--gold),transparent)] opacity-0 transition-opacity duration-300 group-hover/card:opacity-70"
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
        <span className="label-rune text-[0.625rem]">
          Vai trò · {PROJECT_ROLE_LABELS[project.my_role]}
        </span>
      </CardContent>
    </Card>
  )
}
