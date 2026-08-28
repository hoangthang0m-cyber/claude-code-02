import { CONTENT_FORMAT_LABELS } from "@/lib/domain"
import type { ContentListRow } from "@/modules/content-pipeline/services/content.client"
import { Badge } from "@/components/ui/badge"

type Member = { user_id: string; name: string }

function secondsOf(v: unknown): number | null {
  if (v && typeof v === "object") {
    const o = v as { _seconds?: number; seconds?: number }
    return o._seconds ?? o.seconds ?? null
  }
  return null
}

export function ContentCard({
  item,
  members,
}: {
  item: ContentListRow
  members: Member[]
}) {
  const assignee = members.find((m) => m.user_id === item.assignee_id)?.name
  const deadlineSec = secondsOf(item.deadline)

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-2.5 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{item.code}</span>
        {item.is_overdue && (
          <Badge variant="destructive" className="shrink-0">
            Quá hạn
          </Badge>
        )}
      </div>
      {item.topic && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{item.topic}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{assignee ?? "Chưa gán"}</span>
        {deadlineSec != null && (
          <span>
            {new Date(deadlineSec * 1000).toLocaleDateString("vi-VN")}
          </span>
        )}
        {item.content_format && (
          <span>
            {
              CONTENT_FORMAT_LABELS[
                item.content_format as keyof typeof CONTENT_FORMAT_LABELS
              ]
            }
          </span>
        )}
      </div>
    </div>
  )
}
