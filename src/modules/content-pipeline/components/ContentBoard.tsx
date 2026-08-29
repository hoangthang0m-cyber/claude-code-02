import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  type ContentStatus,
} from "@/lib/domain"
import type { ContentListRow } from "@/modules/content-pipeline/services/content.client"
import { ContentCard } from "@/modules/content-pipeline/components/ContentCard"

type Member = { user_id: string; name: string }

// SPEC §5.2 R3: each item shown in the column of its current status. Display
// only — status changes go through the workflow (§5.3, group 7.4).
export function ContentBoard({
  items,
  members,
}: {
  items: ContentListRow[]
  members: Member[]
}) {
  const byStatus = new Map<ContentStatus, ContentListRow[]>()
  for (const s of CONTENT_STATUSES) byStatus.set(s, [])
  for (const item of items) {
    const list = byStatus.get(item.status as ContentStatus)
    if (list) list.push(item)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {CONTENT_STATUSES.map((status) => {
        const column = byStatus.get(status) ?? []
        return (
          <div
            key={status}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-2"
          >
            <div className="flex items-center justify-between px-1 text-sm font-medium">
              <span>{CONTENT_STATUS_LABELS[status]}</span>
              <span className="text-xs text-muted-foreground">
                {column.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {column.map((item) => (
                <ContentCard key={item.id} item={item} members={members} />
              ))}
              {column.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">—</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
