"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  rangeLabel,
  type CalendarFilters,
  type CalendarItemType,
  type CalendarView,
} from "@/lib/domain/calendar"
import { CalendarFilterMenu } from "@/modules/team-calendar/components/CalendarFilterMenu"
import {
  CalendarSearchPanel,
} from "@/modules/team-calendar/components/CalendarSearchPanel"
import type { SearchRow } from "@/modules/team-calendar/hooks/useCalendarSearch"
import { Button } from "@/components/ui/button"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

// Top bar (Mục D tasks 6.1 / 6.8 / 12.x): view switcher · Hôm nay · ‹ › · range
// label · filter menu · search box · bell.
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
  currentUid,
  onFilterTypes,
  onFilterAssignees,
  onFilterProjectId,
  onToggleMine,
  onClearAllFilters,
  onOpenSearchResult,
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
  currentUid: string | null
  onFilterTypes: (types: CalendarItemType[]) => void
  onFilterAssignees: (ids: string[]) => void
  onFilterProjectId: (projectId: string | null) => void
  onToggleMine: () => void
  onClearAllFilters: () => void
  onOpenSearchResult: (row: SearchRow, hiddenByFilter: boolean) => void
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

      <CalendarFilterMenu
        filters={filters}
        onTypes={onFilterTypes}
        onAssignees={onFilterAssignees}
        onProjectId={onFilterProjectId}
        onToggleMine={onToggleMine}
        onClearAll={onClearAllFilters}
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
        <CalendarSearchPanel
          searchRef={searchRef}
          filters={filters}
          currentUid={currentUid}
          onOpenResult={onOpenSearchResult}
        />
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
