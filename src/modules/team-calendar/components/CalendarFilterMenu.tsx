"use client"

import { ListFilterIcon, UserIcon } from "lucide-react"

import {
  activeFilterCount,
  CALENDAR_ITEM_TYPES,
  CALENDAR_ITEM_TYPE_LABELS,
  type CalendarFilters,
  type CalendarItemType,
} from "@/lib/domain/calendar"
import { useMyProjects } from "@/modules/project-workspace/hooks/useMyProjects"
import { MemberMultiSelect } from "@/modules/team-calendar/components/MemberMultiSelect"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NO_PROJECT = "__none__"

// Persistent view filters (Mục D tasks 9.4 / 9.5 / 12.3 / 12.4): type · assignee
// · linked project, combined with AND. "Việc của tôi" is the assignee shortcut.
// Per-calendar filtering is the sidebar's hide/show — not repeated here. State
// lives in `useCalendarFilters` (sessionStorage), so it survives view switches
// and time navigation within a session.
export function CalendarFilterMenu({
  filters,
  onTypes,
  onAssignees,
  onProjectId,
  onToggleMine,
  onClearAll,
}: {
  filters: CalendarFilters
  onTypes: (types: CalendarItemType[]) => void
  onAssignees: (ids: string[]) => void
  onProjectId: (projectId: string | null) => void
  onToggleMine: () => void
  onClearAll: () => void
}) {
  const { projects } = useMyProjects()
  const count = activeFilterCount(filters)

  function toggleType(t: CalendarItemType) {
    onTypes(
      filters.types.includes(t)
        ? filters.types.filter((x) => x !== t)
        : [...filters.types, t]
    )
  }

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

      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm">
              <ListFilterIcon className="size-3.5" />
              Bộ lọc
              {count > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {count}
                </Badge>
              )}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-72 space-y-3">
          <Field>
            <FieldLabel>Loại</FieldLabel>
            <div className="flex flex-col gap-1">
              {CALENDAR_ITEM_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={filters.types.includes(t)}
                    onCheckedChange={() => toggleType(t)}
                  />
                  {CALENDAR_ITEM_TYPE_LABELS[t]}
                </label>
              ))}
            </div>
          </Field>

          <Field>
            <FieldLabel>Người đảm nhận</FieldLabel>
            <MemberMultiSelect
              value={filters.assigneeIds}
              onChange={onAssignees}
              placeholder="Mọi người"
            />
          </Field>

          <Field>
            <FieldLabel>Dự án liên kết</FieldLabel>
            <Select
              value={filters.projectId ?? NO_PROJECT}
              onValueChange={(v) =>
                onProjectId(!v || v === NO_PROJECT ? null : v)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>Mọi dự án</SelectItem>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={onClearAll}
            >
              Xoá tất cả bộ lọc
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
