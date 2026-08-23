"use client"

import { deleteTask, updateTaskStatus } from "@/modules/tasks/services/tasks.service"
import { NewTaskSheet } from "@/modules/tasks/components/NewTaskSheet"
import { TaskPriorityBadge } from "@/modules/tasks/components/TaskPriorityBadge"
import { TaskStatusSelect } from "@/modules/tasks/components/TaskStatusSelect"
import { useTasks } from "@/modules/tasks/hooks/useTasks"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Trash2Icon } from "lucide-react"

export function TasksView() {
  const { tasks, loading } = useTasks()

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "Đang tải..." : `${tasks.length} công việc`}
        </p>
        <NewTaskSheet />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!loading && tasks.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Chưa có công việc nào. Bấm &quot;New task&quot; để tạo mới.
              </TableCell>
            </TableRow>
          )}
          {tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="font-medium">{task.title}</TableCell>
              <TableCell>{task.assignee}</TableCell>
              <TableCell>
                <TaskPriorityBadge priority={task.priority} />
              </TableCell>
              <TableCell>
                <TaskStatusSelect
                  value={task.status}
                  onChange={(status) => updateTaskStatus(task.id, status)}
                />
              </TableCell>
              <TableCell>{task.dueDate}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => deleteTask(task.id)}
                >
                  <Trash2Icon />
                  <span className="sr-only">Delete</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
