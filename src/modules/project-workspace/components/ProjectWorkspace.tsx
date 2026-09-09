"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeftIcon, PencilIcon } from "lucide-react"

import {
  PROJECT_LIFECYCLE_LABELS,
  PROJECT_LIFECYCLE_TRANSITIONS,
  isProjectWritable,
} from "@/lib/domain"
import { cn } from "@/utils/cn"
import { useMyProjectRole } from "@/modules/project-workspace/hooks/useMyProjectRole"
import { useProject } from "@/modules/project-workspace/hooks/useProject"
import { ContentTable } from "@/modules/content-pipeline/components/ContentTable"
import { DeleteProjectControl } from "@/modules/project-workspace/components/DeleteProjectControl"
import { LifecycleControl } from "@/modules/project-workspace/components/LifecycleControl"
import { ProjectFormSheet } from "@/modules/project-workspace/components/ProjectFormSheet"
import { ProjectMembersPanel } from "@/modules/project-workspace/components/ProjectMembersPanel"
import { ReferenceLinksPanel } from "@/modules/reference-links/components/ReferenceLinksPanel"
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
  const hasLifecycleActions =
    isManager && PROJECT_LIFECYCLE_TRANSITIONS[project.lifecycle].length > 0

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <Link
        href="/campaigns"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Danh sách dự án
      </Link>

      {/* Tiêu đề + trạng thái dự án */}
      <Panel className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h1>
            <Badge
              variant={project.lifecycle === "running" ? "default" : "secondary"}
            >
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

        {hasLifecycleActions && (
          <div className="border-t pt-4">
            <LifecycleControl
              project={project}
              canManage={Boolean(isManager)}
            />
          </div>
        )}
      </Panel>

      {/* Tổng quan — mỗi trường là một ô riêng */}
      <Panel>
        <PanelHeading>Tổng quan dự án</PanelHeading>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mục tiêu" value={project.objective} />
          {project.scale && <Field label="Quy mô" value={project.scale} />}
          {project.description && (
            <Field
              label="Mô tả"
              value={project.description}
              className="sm:col-span-2"
            />
          )}
          {project.retrospective && (
            <Field
              label="Đúc kết sau dự án"
              value={project.retrospective}
              className="sm:col-span-2"
            />
          )}
        </div>
      </Panel>

      <Panel>
        <ReferenceLinksPanel
          ownerType="project"
          ownerId={projectId}
          title="Chi tiết dự án"
        />
      </Panel>

      <Panel>
        <ContentTable
          projectId={projectId}
          editable={isProjectWritable(project.lifecycle)}
          canEvaluate={canEdit}
        />
      </Panel>

      <Panel>
        <ProjectMembersPanel projectId={projectId} canManage={canEdit} />
      </Panel>

      {isManager && (
        <DeleteProjectControl
          projectId={projectId}
          projectName={project.name}
        />
      )}
    </div>
  )
}

/** A raised, clearly-bounded section card — the building block that makes each
 * part of the page read as its own "floating" panel rather than one flat sheet. */
function Panel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "mystic-panel flex flex-col gap-3 rounded-2xl bg-card p-4 text-card-foreground",
        "ring-1 ring-foreground/10 md:p-5",
        className
      )}
    >
      {children}
    </div>
  )
}

function PanelHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-heading text-[1.0625rem] font-semibold tracking-[-0.01em]">
      {children}
    </h2>
  )
}

/** One labelled fact about the project, boxed so it stands apart from its
 * neighbours. */
function Field({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg bg-muted/40 p-3.5",
        "ring-1 ring-foreground/10",
        "shadow-[0_1px_5px_-2px_rgba(0,0,0,0.15)]",
        className
      )}
    >
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-sm leading-relaxed whitespace-pre-wrap">
        {value}
      </span>
    </div>
  )
}
