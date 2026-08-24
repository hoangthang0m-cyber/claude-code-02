import { Badge } from "@/components/ui/badge"
import { CAMPAIGN_PRIORITY_LABELS, type CampaignPriority } from "@/constants/priority"

const VARIANT_BY_PRIORITY: Record<CampaignPriority, "outline" | "secondary" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
}

export function PriorityBadge({ priority }: { priority: CampaignPriority }) {
  return (
    <Badge variant={VARIANT_BY_PRIORITY[priority]}>
      {CAMPAIGN_PRIORITY_LABELS[priority]}
    </Badge>
  )
}
