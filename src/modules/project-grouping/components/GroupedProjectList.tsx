"use client"

import * as React from "react"
import Link from "next/link"
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
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  FolderInputIcon,
  FolderPlusIcon,
  GripVerticalIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { useAuth } from "@/context/AuthContext"
import type {
  GroupedProjectList as GroupedList,
  ProjectGroup,
} from "@/lib/domain"
import { useCollapsedGroups } from "@/modules/project-grouping/hooks/useCollapsedGroups"
import { useGroupedProjects } from "@/modules/project-grouping/hooks/useGroupedProjects"
import { ProjectGroupFormSheet } from "@/modules/project-grouping/components/ProjectGroupFormSheet"
import {
  deleteProjectGroup,
  reorderProject,
  setProjectGroup,
  setProjectGroupLifecycle,
} from "@/modules/project-grouping/services/projectGroups.client"
import { ProjectCard } from "@/modules/project-workspace/components/ProjectCard"
import { ProjectFormSheet } from "@/modules/project-workspace/components/ProjectFormSheet"
import { deleteProject } from "@/modules/project-workspace/services/projects.client"
import type { MyProject } from "@/modules/project-workspace/hooks/useMyProjects"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/utils/cn"

const UNGROUPED_KEY = "__ungrouped__"

// A ⋮ / handle button that reads clearly at rest (not a faint ghost) and lifts
// on hover / when its menu is open.
const ICON_BTN = cn(
  "flex size-7 shrink-0 items-center justify-center rounded-md",
  "text-muted-foreground ring-1 ring-transparent transition-colors",
  "hover:bg-accent hover:text-foreground hover:ring-border",
  "data-popup-open:bg-accent data-popup-open:text-foreground data-popup-open:ring-border"
)

export function GroupedProjectList() {
  const { profile } = useAuth()
  const isManager = profile?.system_role === "manager"
  const [showArchived, setShowArchived] = React.useState(false)
  const { grouped, loading, error } = useGroupedProjects({
    includeArchived: showArchived,
  })
  const { collapsed, toggle } = useCollapsedGroups()

  const allProjects = React.useMemo(() => collectProjects(grouped), [grouped])
  const groupOptions = React.useMemo(
    () =>
      [...grouped.groups, ...grouped.archived].map((b) => ({
        id: b.group.id,
        name: b.group.name,
      })),
    [grouped]
  )

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
            <ProjectGroupFormSheet
              mode="create"
              trigger={
                <Button variant="outline">
                  <FolderPlusIcon />
                  Nhóm mới
                </Button>
              }
            />
          )}
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
              group={block.group}
              count={block.count}
              projects={block.projects}
              bucketId={block.group.id}
              collapsed={collapsed.has(block.group.id)}
              onToggle={() => toggle(block.group.id)}
              isManager={isManager}
              allProjects={allProjects}
              groupOptions={groupOptions}
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
            groupOptions={groupOptions}
          />

          {showArchived &&
            grouped.archived.map((block) => (
              <Block
                key={block.group.id}
                blockKey={block.group.id}
                title={block.group.name}
                group={block.group}
                count={block.count}
                projects={block.projects}
                bucketId={block.group.id}
                collapsed={collapsed.has(block.group.id)}
                onToggle={() => toggle(block.group.id)}
                isManager={isManager}
                allProjects={allProjects}
                groupOptions={groupOptions}
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
  group,
  count,
  projects,
  bucketId,
  collapsed,
  onToggle,
  isManager,
  allProjects,
  groupOptions,
  archived,
}: {
  blockKey: string
  title: string
  group?: ProjectGroup
  count: number
  projects: MyProject[]
  bucketId: string | null
  collapsed: boolean
  onToggle: () => void
  isManager: boolean
  allProjects: MyProject[]
  groupOptions: Array<{ id: string; name: string }>
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

        {isManager && bucketId !== null && !archived && (
          <Link
            href={`/campaigns/groups/${bucketId}`}
            className="text-xs text-primary hover:underline"
          >
            Xem tổng hợp
          </Link>
        )}

        {isManager && group && !archived && (
          <ProjectGroupFormSheet
            mode="edit"
            group={group}
            trigger={
              <Button variant="ghost" size="xs" className="gap-1 text-xs">
                <PencilIcon className="size-3.5" />
                Sửa nhóm
              </Button>
            }
          />
        )}

        {isManager && bucketId !== null && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(ICON_BTN, "ml-auto")}
                  aria-label="Quản lý nhóm"
                />
              }
            >
              <MoreVerticalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate text-foreground">
                {title}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await setProjectGroupLifecycle(
                      bucketId,
                      archived ? "active" : "archived"
                    )
                    toast.success(archived ? "Đã bỏ lưu trữ" : "Đã lưu trữ")
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Lỗi")
                  }
                }}
              >
                {archived ? (
                  <>
                    <ArchiveRestoreIcon /> Bỏ lưu trữ
                  </>
                ) : (
                  <>
                    <ArchiveIcon /> Lưu trữ
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Xoá nhóm "${title}"? Dự án trong nhóm chuyển về "Chưa phân nhóm", không dự án nào bị xoá.`
                    )
                  )
                    return
                  try {
                    const r = await deleteProjectGroup(bucketId)
                    toast.success(
                      `Đã xoá nhóm — ${r.projects_reassigned} dự án về "Chưa phân nhóm"`
                    )
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Lỗi")
                  }
                }}
              >
                <Trash2Icon /> Xoá nhóm
              </DropdownMenuItem>
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
                  <Row
                    key={p.id}
                    project={p}
                    draggable={canDrag}
                    isManager={isManager}
                    groupOptions={groupOptions}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ))}
    </section>
  )
}

function Row({
  project,
  draggable,
  isManager,
  groupOptions,
}: {
  project: MyProject
  draggable: boolean
  isManager: boolean
  groupOptions: Array<{ id: string; name: string }>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id, disabled: !draggable })

  const currentGroup = project.group_id ?? null

  async function move(groupId: string | null) {
    try {
      await setProjectGroup(project.id, groupId)
      toast.success("Đã chuyển nhóm")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không chuyển được")
    }
  }

  async function remove() {
    const typed = window
      .prompt(
        `Xoá vĩnh viễn dự án này? Toàn bộ hạng mục, lịch sử, bình luận và số ` +
          `liệu ads sẽ mất, KHÔNG khôi phục được.\n\nGõ đúng tên để xác nhận:\n${project.name}`
      )
      ?.trim()
    if (!typed) return
    if (typed !== project.name.trim()) {
      toast.error("Tên không khớp — đã huỷ")
      return
    }
    try {
      const r = await deleteProject(project.id, typed)
      toast.success(
        `Đã xoá "${project.name}" — ${r.content_items_deleted} hạng mục`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xoá được")
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "z-10 opacity-80")}
    >
      <ProjectCard
        project={project}
        actions={
          isManager ? (
            <>
              {draggable && (
                <button
                  type="button"
                  aria-label="Kéo để sắp thứ tự"
                  className={cn(ICON_BTN, "cursor-grab active:cursor-grabbing")}
                  {...attributes}
                  {...listeners}
                >
                  <GripVerticalIcon className="size-4" />
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className={ICON_BTN}
                      aria-label="Tuỳ chọn dự án"
                    />
                  }
                >
                  <MoreVerticalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate text-foreground">
                    {project.name}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderInputIcon /> Chuyển nhóm
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 w-48 overflow-y-auto">
                      <DropdownMenuItem
                        disabled={currentGroup === null}
                        onClick={() => move(null)}
                      >
                        Chưa phân nhóm
                      </DropdownMenuItem>
                      {groupOptions.length > 0 && <DropdownMenuSeparator />}
                      {groupOptions.map((g) => (
                        <DropdownMenuItem
                          key={g.id}
                          disabled={currentGroup === g.id}
                          onClick={() => move(g.id)}
                        >
                          {g.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={remove}>
                    <Trash2Icon /> Xoá dự án vĩnh viễn
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : undefined
        }
      />
    </div>
  )
}
