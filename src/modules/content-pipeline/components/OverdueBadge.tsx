import { Badge } from "@/components/ui/badge"

// SPEC §5.3 R6 / §6.7: the single "quá hạn" marker. Rendered identically on the
// content table, the Kanban board and (task 8.x) the dashboard so the flag reads
// the same everywhere. `overdue` is the server-computed `is_overdue`.
export function OverdueBadge({ overdue }: { overdue?: boolean }) {
  if (!overdue) return null
  return (
    <Badge variant="destructive" className="shrink-0">
      Quá hạn
    </Badge>
  )
}
