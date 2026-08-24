"use client"

import { PriorityBadge } from "@/components/data-display/PriorityBadge"
import { StatusBadge } from "@/components/data-display/StatusBadge"
import { formatDate, isOverdue } from "@/utils/date"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"

export function CampaignCard({
  campaign,
  onClick,
  dragHandleProps,
}: {
  campaign: Campaign
  onClick?: () => void
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}) {
  const overdue = isOverdue(campaign.dueDate, campaign.status === "done")

  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-sm hover:border-primary/50"
      {...dragHandleProps}
    >
      <p className="font-medium">{campaign.title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={campaign.priority} />
        <StatusBadge status={campaign.status} overdue={overdue} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{campaign.assigneeId || "Chưa giao"}</span>
        <span>{formatDate(campaign.dueDate)}</span>
      </div>
    </div>
  )
}
