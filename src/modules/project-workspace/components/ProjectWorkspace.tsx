"use client"

import Link from "next/link"
import { ArrowLeftIcon, ExternalLinkIcon, PencilIcon } from "lucide-react"

import {
  PROJECT_LIFECYCLE_LABELS,
  isProjectWritable,
} from "@/lib/domain"
import { useMyProjectRole } from "@/modules/project-workspace/hooks/useMyProjectRole"
import { useProject } from "@/modules/project-workspace/hooks/useProject"
import { ContentTable } from "@/modules/content-pipeline/components/ContentTable"
import { LifecycleControl } from "@/modules/project-workspace/components/LifecycleControl"
import { ProjectFormSheet } from "@/modules/project-workspace/components/ProjectFormSheet"
import { ProjectMembersPanel } from "@/modules/project-workspace/components/ProjectMembersPanel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const { project, loading, error } = useProject(projectId)
  const myRole = useMyProjectRole(projectId)
  const isManager = myRole === "manager"

  if (loading) {
    return <Skeleton className="h-64 rounded-xl" />
  }
  if (error) {
    return <p className="text-sm text-destructive">Lỗi: {error}</p>
  }
  if (!project) {
    return (
      <p className="text-sm text-muted-foreground">
        Không tìm thấy dự án, hoặc bạn không phải thành viên.
      </p>
    )
  }

  const canEdit = isManager && isProjectWritable(project.lifecycle)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/campaigns"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> Danh sách dự án
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <Badge variant={project.lifecycle === "running" ? "default" : "secondary"}>
              {PROJECT_LIFECYCLE_LABELS[project.lifecycle]}
            </Badge>
          </div>
          {canEdit && (
            <ProjectFormSheet
              mode="edit"
              project={project}
              trigger={
                <Button variant="outline" size="sm">
                  <PencilIcon className="size-4" /> Sửa
                </Button>
              }
            />
          )}
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Info label="Mục tiêu" value={project.objective} />
        {project.description && (
          <Info label="Mô tả" value={project.description} />
        )}
        {project.scale && <Info label="Quy mô" value={project.scale} />}
        {project.retrospective && (
          <Info label="Đúc kết" value={project.retrospective} />
        )}
        {project.progress_sheet_url && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Tiến độ (Sheets)</dt>
            <dd>
              <a
                href={project.progress_sheet_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Mở Google Sheet <ExternalLinkIcon className="size-3.5" />
              </a>
            </dd>
          </div>
        )}
      </dl>

      <LifecycleControl project={project} canManage={Boolean(isManager)} />

      <ContentTable
        projectId={projectId}
        editable={isProjectWritable(project.lifecycle)}
        canEvaluate={canEdit}
      />

      <ProjectMembersPanel projectId={projectId} canManage={canEdit} />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  )
}
