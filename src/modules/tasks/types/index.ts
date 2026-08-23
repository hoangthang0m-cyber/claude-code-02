import type { TaskPriority } from "@/types/task"

export interface TaskFormValues {
  title: string
  assignee: string
  dueDate: string
  priority: TaskPriority
}
