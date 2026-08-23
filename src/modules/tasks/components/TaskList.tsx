"use client"

import { PriorityBadge } from "@/components/data-display/PriorityBadge"
import { StatusBadge } from "@/components/data-display/StatusBadge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, isOverdue } from "@/utils/date"
import type { Task } from "@/modules/tasks/types/task.types"

export function TaskList({
  tasks,
  onSelectTask,
}: {
  tasks: Task[]
  onSelectTask: (taskId: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Assignee</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              Chưa có công việc nào phù hợp bộ lọc.
            </TableCell>
          </TableRow>
        )}
        {tasks.map((task) => {
          const overdue = isOverdue(task.dueDate, task.status === "done")
          return (
            <TableRow
              key={task.id}
              className="cursor-pointer"
              onClick={() => onSelectTask(task.id)}
            >
              <TableCell className="font-medium">{task.title}</TableCell>
              <TableCell>{task.assigneeId || "Chưa giao"}</TableCell>
              <TableCell>
                <PriorityBadge priority={task.priority} />
              </TableCell>
              <TableCell>
                <StatusBadge status={task.status} overdue={overdue} />
              </TableCell>
              <TableCell>{formatDate(task.dueDate)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
