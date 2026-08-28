import { CONTENT_STATUS_LABELS, type ContentStatus } from "@/lib/domain"
import { Badge } from "@/components/ui/badge"

const VARIANT: Record<ContentStatus, "outline" | "secondary" | "default"> = {
  chua_bat_dau: "outline",
  viet_kich_ban: "secondary",
  cho_duyet_kich_ban: "secondary",
  quay_dung: "secondary",
  cho_duyet_video: "secondary",
  da_duyet: "default",
  da_len_ads: "default",
}

export function ContentStatusBadge({ status }: { status: string }) {
  const s = status as ContentStatus
  return (
    <Badge variant={VARIANT[s] ?? "outline"}>
      {CONTENT_STATUS_LABELS[s] ?? status}
    </Badge>
  )
}
