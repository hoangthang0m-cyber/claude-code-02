import { Badge } from "@/components/ui/badge"
import { TASK_PRIORITY_LABELS } from "@/constants/priority"
import type { TaskPriority } from "@/types/task"

const VARIANT_BY_PRIORITY: Record<TaskPriority, "outline" | "secondary" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
  critical: "destructive",
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant={VARIANT_BY_PRIORITY[priority]}>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  )
}
