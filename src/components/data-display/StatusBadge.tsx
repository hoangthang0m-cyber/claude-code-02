import { Badge } from "@/components/ui/badge"
import { TASK_STATUS_LABELS, type TaskStatus } from "@/constants/status"
import { cn } from "@/utils/cn"

export function StatusBadge({
  status,
  overdue,
  className,
}: {
  status: TaskStatus
  overdue?: boolean
  className?: string
}) {
  if (overdue) {
    return (
      <Badge variant="destructive" className={className}>
        Quá hạn
      </Badge>
    )
  }

  return (
    <Badge
      variant={status === "done" ? "secondary" : "outline"}
      className={cn(className)}
    >
      {TASK_STATUS_LABELS[status]}
    </Badge>
  )
}
