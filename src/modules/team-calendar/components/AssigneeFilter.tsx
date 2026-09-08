"use client"

import { UserIcon, XIcon } from "lucide-react"

import type { CalendarFilters } from "@/lib/domain/calendar"
import { MemberMultiSelect } from "@/modules/team-calendar/components/MemberMultiSelect"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// Toolbar filter for "Người đảm nhận" plus the "Việc của tôi" shortcut
// (Mục D tasks 9.4 / 9.5). The state itself lives in `useCalendarFilters`
// (sessionStorage), so it survives view switches and time navigation.
export function AssigneeFilter({
  filters,
  onAssignees,
  onToggleMine,
  onClear,
}: {
  filters: CalendarFilters
  onAssignees: (ids: string[]) => void
  onToggleMine: () => void
  onClear: () => void
}) {
  const count = filters.assigneeIds.length
  const anyActive = filters.mine || count > 0

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={filters.mine ? "secondary" : "outline"}
        size="sm"
        aria-pressed={filters.mine}
        onClick={onToggleMine}
      >
        <UserIcon className="size-3.5" />
        Việc của tôi
      </Button>

      <div className="w-40">
        <MemberMultiSelect
          value={filters.assigneeIds}
          onChange={onAssignees}
          placeholder="Người đảm nhận"
          triggerClassName="h-7 text-xs"
        />
      </div>

      {count > 0 && <Badge variant="secondary">{count}</Badge>}

      {anyActive && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          title="Xoá lọc người đảm nhận"
        >
          <XIcon className="size-3.5" />
          <span className="sr-only">Xoá lọc</span>
        </Button>
      )}
    </div>
  )
}
