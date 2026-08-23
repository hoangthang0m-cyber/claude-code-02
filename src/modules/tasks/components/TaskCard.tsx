"use client"

import { PriorityBadge } from "@/components/data-display/PriorityBadge"
import { StatusBadge } from "@/components/data-display/StatusBadge"
import { formatDate, isOverdue } from "@/utils/date"
import type { Task } from "@/modules/tasks/types/task.types"

export function TaskCard({
  task,
  onClick,
  dragHandleProps,
}: {
  task: Task
  onClick?: () => void
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}) {
  const overdue = isOverdue(task.dueDate, task.status === "done")

  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-sm hover:border-primary/50"
      {...dragHandleProps}
    >
      <p className="font-medium">{task.title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} overdue={overdue} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{task.assigneeId || "Chưa giao"}</span>
        <span>{formatDate(task.dueDate)}</span>
      </div>
    </div>
  )
}
