"use client"

import * as React from "react"
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CONTENT_STATUSES, type ContentStatus } from "@/constants/contentStatus"
import { PRIORITY_LABELS, PRIORITY_LEVELS } from "@/constants/priority"
import { useUsers } from "@/hooks/useUsers"
import { ContentDetailDrawer } from "@/modules/campaigns/components/ContentDetailDrawer"
import { ContentKanbanColumn } from "@/modules/campaigns/components/ContentKanbanColumn"
import type { CategoryContentItem } from "@/modules/campaigns/hooks/useCategoryContentItems"
import { updateContentItem } from "@/modules/campaigns/services/contentItems.service"
import type { Campaign, PriorityLevel } from "@/modules/campaigns/types/campaign.types"
import { formatMonth } from "@/utils/date"

export function ContentKanbanBoard({
  items,
  campaigns,
}: {
  items: CategoryContentItem[]
  campaigns: Campaign[]
}) {
  const { users } = useUsers()
  const [campaignFilter, setCampaignFilter] = React.useState("all")
  const [assigneeFilter, setAssigneeFilter] = React.useState("all")
  const [priorityFilter, setPriorityFilter] = React.useState("all")
  const [detailItem, setDetailItem] = React.useState<CategoryContentItem | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const filteredItems = React.useMemo(
    () =>
      items.filter((item) => {
        if (campaignFilter !== "all" && item.campaignId !== campaignFilter) return false
        if (assigneeFilter !== "all" && item.assigneeId !== assigneeFilter) return false
        if (priorityFilter !== "all" && item.priority !== priorityFilter) return false
        return true
      }),
    [items, campaignFilter, assigneeFilter, priorityFilter]
  )

  const itemsByStatus = React.useMemo(() => {
    const map = new Map<ContentStatus, CategoryContentItem[]>()
    for (const status of CONTENT_STATUSES) map.set(status, [])
    for (const item of filteredItems) map.get(item.status)?.push(item)
    return map
  }, [filteredItems])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const nextStatus = over.id as ContentStatus
    const item = items.find((i) => i.id === active.id)
    if (!item || item.status === nextStatus) return
    updateContentItem(item.campaignId, item.id, { status: nextStatus })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={campaignFilter} onValueChange={(value) => setCampaignFilter(value ?? "all")}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Chiến dịch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả tháng</SelectItem>
            {campaigns.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.title || formatMonth(campaign.month)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assigneeFilter} onValueChange={(value) => setAssigneeFilter(value ?? "all")}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Nhân sự" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhân sự</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value ?? "all")}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Mức ưu tiên" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi mức ưu tiên</SelectItem>
            {PRIORITY_LEVELS.map((level: PriorityLevel) => (
              <SelectItem key={level} value={level}>
                {PRIORITY_LABELS[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {CONTENT_STATUSES.map((status) => (
            <ContentKanbanColumn
              key={status}
              status={status}
              items={itemsByStatus.get(status) ?? []}
              onOpenDetail={setDetailItem}
            />
          ))}
        </div>
      </DndContext>

      <ContentDetailDrawer
        campaignId={detailItem?.campaignId ?? ""}
        item={detailItem}
        open={detailItem !== null}
        onOpenChange={(open) => !open && setDetailItem(null)}
      />
    </div>
  )
}
