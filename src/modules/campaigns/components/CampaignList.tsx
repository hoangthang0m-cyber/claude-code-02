"use client"

import { PriorityBadge } from "@/components/data-display/PriorityBadge"
import { StatusBadge } from "@/components/data-display/StatusBadge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, isOverdue } from "@/utils/date"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"

export function CampaignList({
  campaigns,
  onSelectCampaign,
}: {
  campaigns: Campaign[]
  onSelectCampaign: (campaignId: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Assignee</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              Chưa có chiến dịch nào phù hợp bộ lọc.
            </TableCell>
          </TableRow>
        )}
        {campaigns.map((campaign) => {
          const overdue = isOverdue(campaign.dueDate, campaign.status === "done")
          return (
            <TableRow
              key={campaign.id}
              className="cursor-pointer"
              onClick={() => onSelectCampaign(campaign.id)}
            >
              <TableCell className="font-medium">{campaign.title}</TableCell>
              <TableCell>{campaign.assigneeId || "Chưa giao"}</TableCell>
              <TableCell>
                <PriorityBadge priority={campaign.priority} />
              </TableCell>
              <TableCell>
                <StatusBadge status={campaign.status} overdue={overdue} />
              </TableCell>
              <TableCell>{formatDate(campaign.dueDate)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
