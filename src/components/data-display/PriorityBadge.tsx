import { Badge } from "@/components/ui/badge"
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/constants/priority"

const VARIANT_BY_PRIORITY: Record<TaskPriority, "outline" | "secondary" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant={VARIANT_BY_PRIORITY[priority]}>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  )
}
