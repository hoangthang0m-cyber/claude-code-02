"use client"

import { useDroppable } from "@dnd-kit/core"

import { Badge } from "@/components/ui/badge"
import { CONTENT_STATUS_LABELS, type ContentStatus } from "@/constants/contentStatus"
import { ContentKanbanCard } from "@/modules/campaigns/components/ContentKanbanCard"
import type { CategoryContentItem } from "@/modules/campaigns/hooks/useCategoryContentItems"
import { cn } from "@/utils/cn"

export function ContentKanbanColumn({
  status,
  items,
  onOpenDetail,
}: {
  status: ContentStatus
  items: CategoryContentItem[]
  onOpenDetail: (item: CategoryContentItem) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-colors",
        isOver && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between px-1 pt-0.5">
        <span className="text-xs font-semibold text-muted-foreground">
          {CONTENT_STATUS_LABELS[status]}
        </span>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <div className="flex min-h-16 flex-col gap-2">
        {items.map((item) => (
          <ContentKanbanCard key={item.id} item={item} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    </div>
  )
}
