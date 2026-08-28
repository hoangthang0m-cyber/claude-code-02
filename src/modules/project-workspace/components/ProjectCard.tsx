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

export function ProjectCard({ project }: { project: MyProject }) {
  return (
    <Link href={`/campaigns/${project.id}`} className="block">
      <Card className="h-full transition-colors hover:ring-primary/40">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2">{project.name}</CardTitle>
            <Badge variant={LIFECYCLE_VARIANT[project.lifecycle]}>
              {PROJECT_LIFECYCLE_LABELS[project.lifecycle]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {project.objective}
          </p>
          <span className="text-xs text-muted-foreground">
            Vai trò của bạn: {PROJECT_ROLE_LABELS[project.my_role]}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}
