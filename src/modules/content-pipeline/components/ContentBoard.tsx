import type { ContentListRow } from "@/modules/content-pipeline/services/content.client"

// Placeholder — the drag-and-drop Kanban is task 3.7.
export function ContentBoard({ items }: { items: ContentListRow[] }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      Kanban ({items.length} hạng mục) — đang được xây dựng ở task 3.7.
    </p>
  )
}
