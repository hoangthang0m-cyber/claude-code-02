export const TASK_STATUSES = ["todo", "in_progress", "done"] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  done: "Hoàn thành",
}
