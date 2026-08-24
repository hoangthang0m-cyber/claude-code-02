"use client"

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"

import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/constants/status"
import { CAMPAIGN_STATUSES } from "@/constants/status"
import { CampaignCard } from "@/modules/campaigns/components/CampaignCard"
import type { Campaign } from "@/modules/campaigns/types/campaign.types"
import { cn } from "@/utils/cn"

function DraggableCampaignCard({
  campaign,
  onSelectCampaign,
}: {
  campaign: Campaign
  onSelectCampaign: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: campaign.id,
  })
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }
    : undefined

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <CampaignCard campaign={campaign} onClick={() => onSelectCampaign(campaign.id)} />
    </div>
  )
}

function KanbanColumn({
  status,
  campaigns,
  onSelectCampaign,
}: {
  status: CampaignStatus
  campaigns: Campaign[]
  onSelectCampaign: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-64 w-72 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-3 transition-colors",
        isOver && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{CAMPAIGN_STATUS_LABELS[status]}</h3>
        <span className="text-xs text-muted-foreground">{campaigns.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {campaigns.map((campaign) => (
          <DraggableCampaignCard key={campaign.id} campaign={campaign} onSelectCampaign={onSelectCampaign} />
        ))}
      </div>
    </div>
  )
}

export function CampaignKanbanBoard({
  campaigns,
  onSelectCampaign,
  onStatusChange,
}: {
  campaigns: Campaign[]
  onSelectCampaign: (id: string) => void
  onStatusChange: (campaignId: string, status: CampaignStatus) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const newStatus = over.id as CampaignStatus
    const campaign = campaigns.find((item) => item.id === active.id)
    if (campaign && campaign.status !== newStatus) {
      onStatusChange(campaign.id, newStatus)
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {CAMPAIGN_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            campaigns={campaigns.filter((campaign) => campaign.status === status)}
            onSelectCampaign={onSelectCampaign}
          />
        ))}
      </div>
    </DndContext>
  )
}
