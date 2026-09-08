"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react"

import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  rangeLabel,
  type CalendarFilters,
  type CalendarView,
} from "@/lib/domain/calendar"
import { AssigneeFilter } from "@/modules/team-calendar/components/AssigneeFilter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

// Top bar (Mục D task 6.1 / 6.8): view switcher · Hôm nay · ‹ › · range label ·
// search box. The search box wiring is group 12.
export function CalendarToolbar({
  view,
  onView,
  anchor,
  onToday,
  onStep,
  searchRef,
  showWeekNumbers,
  onToggleWeekNumbers,
  filters,
  onFilterAssignees,
  onToggleMine,
  onClearAssigneeFilter,
  notificationBell,
}: {
  view: CalendarView
  onView: (v: CalendarView) => void
  anchor: string
  onToday: () => void
  onStep: (direction: 1 | -1) => void
  searchRef?: React.Ref<HTMLInputElement>
  showWeekNumbers: boolean
  onToggleWeekNumbers: (next: boolean) => void
  filters: CalendarFilters
  onFilterAssignees: (ids: string[]) => void
  onToggleMine: () => void
  onClearAssigneeFilter: () => void
  notificationBell?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b p-2">
      <Button variant="outline" size="sm" onClick={onToday}>
        Hôm nay
      </Button>
      <div className="flex">
        <Button variant="ghost" size="icon-sm" onClick={() => onStep(-1)}>
          <ChevronLeftIcon />
          <span className="sr-only">Trước</span>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => onStep(1)}>
          <ChevronRightIcon />
          <span className="sr-only">Sau</span>
        </Button>
      </div>
      <span className="min-w-40 text-sm font-medium">
        {rangeLabel(view, anchor)}
      </span>

      <AssigneeFilter
        filters={filters}
        onAssignees={onFilterAssignees}
        onToggleMine={onToggleMine}
        onClear={onClearAssigneeFilter}
      />

      <div className="ml-auto flex items-center gap-2">
        {notificationBell}
        {(view === "week" || view === "month") && (
          <label className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <input
              type="checkbox"
              checked={showWeekNumbers}
              onChange={(e) => onToggleWeekNumbers(e.target.checked)}
            />
            Số tuần
          </label>
        )}
        <div className="relative hidden sm:block">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Tìm mục lịch…"
            className="h-8 w-48 pl-7"
          />
        </div>
        <ToggleGroup
          value={[view]}
          onValueChange={(v) => v[0] && onView(v[0] as CalendarView)}
          className="hidden md:flex"
        >
          {CALENDAR_VIEWS.map((v) => (
            <ToggleGroupItem key={v} value={v} className="px-2 text-xs">
              {CALENDAR_VIEW_LABELS[v]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}
