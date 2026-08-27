import { isContentStatusExemptFromOverdue } from "@/constants/contentStatus"
import type { ContentItem } from "@/modules/campaigns/types/campaign.types"

export function isContentOverdue(item: Pick<ContentItem, "deadline" | "status">): boolean {
  if (!item.deadline) return false
  if (isContentStatusExemptFromOverdue(item.status)) return false
  return item.deadline.toMillis() < Date.now()
}
