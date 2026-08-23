"use client"

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"

import { TASK_STATUS_LABELS, type TaskStatus } from "@/constants/status"
import { TASK_STATUSES } from "@/constants/status"
import { TaskCard } from "@/modules/tasks/components/TaskCard"
import type { Task } from "@/modules/tasks/types/task.types"
import { cn } from "@/utils/cn"

function DraggableTaskCard({
  task,
  onSelectTask,
}: {
  task: Task
  onSelectTask: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  })
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }
    : undefined

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TaskCard task={task} onClick={() => onSelectTask(task.id)} />
    </div>
  )
}

function KanbanColumn({
  status,
  tasks,
  onSelectTask,
}: {
  status: TaskStatus
  tasks: Task[]
  onSelectTask: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-64 w-72 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-3 transition-colors",
        isOver && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{TASK_STATUS_LABELS[status]}</h3>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} onSelectTask={onSelectTask} />
        ))}
      </div>
    </div>
  )
}

export function TaskKanbanBoard({
  tasks,
  onSelectTask,
  onStatusChange,
}: {
  tasks: Task[]
  onSelectTask: (id: string) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const newStatus = over.id as TaskStatus
    const task = tasks.find((item) => item.id === active.id)
    if (task && task.status !== newStatus) {
      onStatusChange(task.id, newStatus)
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {TASK_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasks.filter((task) => task.status === status)}
            onSelectTask={onSelectTask}
          />
        ))}
      </div>
    </DndContext>
  )
}
