"use client"

import { PlusIcon } from "lucide-react"

import { useAuth } from "@/context/AuthContext"
import { useMyProjects } from "@/modules/project-workspace/hooks/useMyProjects"
import { ProjectCard } from "@/modules/project-workspace/components/ProjectCard"
import { ProjectFormSheet } from "@/modules/project-workspace/components/ProjectFormSheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function ProjectList() {
  const { profile } = useAuth()
  const { projects, loading, error } = useMyProjects()
  const canCreate = profile?.system_role === "manager"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Dự án</h1>
        {canCreate && (
          <ProjectFormSheet
            mode="create"
            trigger={
              <Button>
                <PlusIcon />
                Tạo dự án mới
              </Button>
            }
          />
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">Lỗi tải dữ liệu: {error}</p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {canCreate
            ? "Chưa có dự án nào. Bấm “Tạo dự án mới” để bắt đầu."
            : "Bạn chưa được thêm vào dự án nào."}
        </p>
      )}
    </div>
  )
}
