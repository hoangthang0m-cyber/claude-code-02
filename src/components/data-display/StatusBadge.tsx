import { Badge } from "@/components/ui/badge"
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/constants/status"
import { cn } from "@/utils/cn"

export function StatusBadge({
  status,
  overdue,
  className,
}: {
  status: CampaignStatus
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
      {CAMPAIGN_STATUS_LABELS[status]}
    </Badge>
  )
}
