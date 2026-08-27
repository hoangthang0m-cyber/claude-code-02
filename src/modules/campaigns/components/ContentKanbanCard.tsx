"use client"

import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"

import { Badge } from "@/components/ui/badge"
import { getAssigneeColor } from "@/constants/assigneeColors"
import { PRIORITY_BADGE_VARIANT, PRIORITY_LABELS } from "@/constants/priority"
import { useUsers } from "@/hooks/useUsers"
import type { CategoryContentItem } from "@/modules/campaigns/hooks/useCategoryContentItems"
import { isContentOverdue } from "@/modules/campaigns/utils/contentOverdue"
import { cn } from "@/utils/cn"
import { formatDate, formatMonth } from "@/utils/date"
import { CalendarIcon } from "lucide-react"

export function ContentKanbanCard({
  item,
  onOpenDetail,
}: {
  item: CategoryContentItem
  onOpenDetail: (item: CategoryContentItem) => void
}) {
  const { users } = useUsers()
  const assignee = users.find((u) => u.id === item.assigneeId)
  const overdue = isContentOverdue(item)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  })

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "flex w-full touch-none flex-col gap-2 rounded-lg border bg-card p-2.5 text-left shadow-sm transition-shadow hover:shadow-md",
        isDragging && "z-10 opacity-70 shadow-lg"
      )}
      onClick={() => !isDragging && onOpenDetail(item)}
      {...attributes}
      {...listeners}
    >
      <p className="line-clamp-2 text-sm font-medium">
        {item.scriptTitle || "Content chưa đặt tên"}
      </p>
      {item.topic && <p className="line-clamp-1 text-xs text-muted-foreground">{item.topic}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {assignee && (
          <Badge className={getAssigneeColor(assignee.id)}>{assignee.name}</Badge>
        )}
        {item.priority && (
          <Badge variant={PRIORITY_BADGE_VARIANT[item.priority]}>
            {PRIORITY_LABELS[item.priority]}
          </Badge>
        )}
        {item.campaign && <Badge variant="outline">{formatMonth(item.campaign.month)}</Badge>}
      </div>

      {typeof item.progress === "number" && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
          />
        </div>
      )}

      {item.deadline && (
        <div
          className={cn(
            "flex items-center gap-1 text-xs",
            overdue ? "font-medium text-destructive" : "text-muted-foreground"
          )}
        >
          <CalendarIcon className="size-3" />
          {formatDate(item.deadline)}
          {overdue && " · Trễ hạn"}
        </div>
      )}
    </button>
  )
}
