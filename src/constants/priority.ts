import type { TaskPriority } from "@/types/task"

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"]

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
}
