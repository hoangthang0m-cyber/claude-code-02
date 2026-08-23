export type TaskStatus = "todo" | "in_progress" | "done" | "blocked"
export type TaskPriority = "low" | "medium" | "high" | "critical"

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee: string
  dueDate: string
  createdBy: string
  createdAt?: string
}
