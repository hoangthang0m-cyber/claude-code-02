import type { TaskStatus } from "@/types/task"

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "blocked"]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
}
