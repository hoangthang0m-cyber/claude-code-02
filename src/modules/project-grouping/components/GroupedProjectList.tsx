"use client"

import * as React from "react"
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { toast } from "sonner"
import { ChevronDownIcon, GripVerticalIcon, PlusIcon } from "lucide-react"

import { useAuth } from "@/context/AuthContext"
import type { GroupedProjectList as GroupedList } from "@/lib/domain"
import { useCollapsedGroups } from "@/modules/project-grouping/hooks/useCollapsedGroups"
import { useGroupedProjects } from "@/modules/project-grouping/hooks/useGroupedProjects"
import {
  reorderProject,
  setProjectGroup,
} from "@/modules/project-grouping/services/projectGroups.client"
import { ProjectCard } from "@/modules/project-workspace/components/ProjectCard"
import { ProjectFormSheet } from "@/modules/project-workspace/components/ProjectFormSheet"
import type { MyProject } from "@/modules/project-workspace/hooks/useMyProjects"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/utils/cn"

const UNGROUPED_KEY = "__ungrouped__"

export function GroupedProjectList() {
  const { profile } = useAuth()
  const isManager = profile?.system_role === "manager"
  const [showArchived, setShowArchived] = React.useState(false)
  const { grouped, loading, error } = useGroupedProjects({
    includeArchived: showArchived,
  })
  const { collapsed, toggle } = useCollapsedGroups()

  const allProjects = React.useMemo(() => collectProjects(grouped), [grouped])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Dự án</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Checkbox
              checked={showArchived}
              onCheckedChange={(c) => setShowArchived(c === true)}
            />
            Nhóm đã lưu trữ
          </label>
          {isManager && (
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
      </div>

      {error && <p className="text-sm text-destructive">Lỗi tải dữ liệu: {error}</p>}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.groups.map((block) => (
            <Block
              key={block.group.id}
              blockKey={block.group.id}
              title={block.group.name}
              count={block.count}
              projects={block.projects}
              bucketId={block.group.id}
              collapsed={collapsed.has(block.group.id)}
              onToggle={() => toggle(block.group.id)}
              isManager={isManager}
              allProjects={allProjects}
            />
          ))}

          <Block
            blockKey={UNGROUPED_KEY}
            title="Chưa phân nhóm"
            count={grouped.ungrouped.count}
            projects={grouped.ungrouped.projects}
            bucketId={null}
            collapsed={collapsed.has(UNGROUPED_KEY)}
            onToggle={() => toggle(UNGROUPED_KEY)}
            isManager={isManager}
            allProjects={allProjects}
          />

          {showArchived &&
            grouped.archived.map((block) => (
              <Block
                key={block.group.id}
                blockKey={block.group.id}
                title={block.group.name}
                count={block.count}
                projects={block.projects}
                bucketId={block.group.id}
                collapsed={collapsed.has(block.group.id)}
                onToggle={() => toggle(block.group.id)}
                isManager={false}
                allProjects={allProjects}
                archived
              />
            ))}

          {grouped.groups.length === 0 &&
            grouped.ungrouped.count === 0 &&
            !showArchived && (
              <p className="text-sm text-muted-foreground">
                {isManager
                  ? "Chưa có dự án nào. Bấm “Tạo dự án mới” để bắt đầu."
                  : "Bạn chưa được thêm vào dự án nào."}
              </p>
            )}
        </div>
      )}
    </div>
  )
}

function collectProjects(grouped: GroupedList<MyProject>): MyProject[] {
  return [
    ...grouped.groups.flatMap((b) => b.projects),
    ...grouped.ungrouped.projects,
    ...grouped.archived.flatMap((b) => b.projects),
  ]
}

function Block({
  blockKey,
  title,
  count,
  projects,
  bucketId,
  collapsed,
  onToggle,
  isManager,
  allProjects,
  archived,
}: {
  blockKey: string
  title: string
  count: number
  projects: MyProject[]
  bucketId: string | null
  collapsed: boolean
  onToggle: () => void
  isManager: boolean
  allProjects: MyProject[]
  archived?: boolean
}) {
  void blockKey
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  // task 4.6 — optimistic order so a drag doesn't snap back before the realtime
  // write lands. Keyed by the incoming id-signature: when realtime delivers a
  // new order the key changes and the override is dropped (no setState-in-effect).
  const sig = projects.map((p) => p.id).join(",")
  const [override, setOverride] = React.useState<{ sig: string; order: string[] } | null>(null)
  const order = override?.sig === sig ? override.order : projects.map((p) => p.id)

  const byId = new Map(projects.map((p) => [p.id, p]))
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as MyProject[]

  const assignable = allProjects.filter(
    (p) => (p.group_id ?? null) !== bucketId
  )

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    const next = [...order]
    next.splice(oldIndex, 1)
    next.splice(newIndex, 0, String(active.id))
    setOverride({ sig, order: next })

    const afterId = newIndex === 0 ? null : next[newIndex - 1]
    try {
      await reorderProject(String(active.id), afterId)
    } catch (err) {
      setOverride(null) // roll back to the realtime order
      toast.error(err instanceof Error ? err.message : "Không đổi được thứ tự")
    }
  }

  async function assign(projectId: string) {
    try {
      await setProjectGroup(projectId, bucketId)
      toast.success("Đã chuyển nhóm")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không chuyển được")
    }
  }

  const canDrag = isManager && !archived && count > 1

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary"
          aria-expanded={!collapsed}
        >
          <ChevronDownIcon
            className={cn("size-4 transition-transform", collapsed && "-rotate-90")}
          />
          {title}
          <span className="text-xs font-normal text-muted-foreground">
            ({count})
          </span>
          {archived && (
            <Badge variant="outline" className="text-[10px]">
              Đã lưu trữ
            </Badge>
          )}
        </button>

        {isManager && !archived && assignable.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="xs" className="text-muted-foreground">
                  <PlusIcon className="size-3.5" /> dự án
                </Button>
              }
            />
            <DropdownMenuContent className="max-h-72 overflow-y-auto">
              {assignable.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => assign(p.id)}>
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!collapsed &&
        (count === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Chưa có dự án trong nhóm này
            {isManager && !archived ? " — dùng “＋ dự án” ở trên để thêm" : ""}
          </p>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext
              items={ordered.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ordered.map((p) => (
                  <Row key={p.id} project={p} draggable={canDrag} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ))}
    </section>
  )
}

function Row({ project, draggable }: { project: MyProject; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id, disabled: !draggable })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-70")}
    >
      {draggable && (
        <button
          type="button"
          className="absolute top-2 right-2 z-10 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label="Kéo để sắp thứ tự"
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      )}
      <ProjectCard project={project} />
    </div>
  )
}
