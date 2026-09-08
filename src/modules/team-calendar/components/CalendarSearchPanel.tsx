"use client"

import * as React from "react"
import { EyeOffIcon, SearchIcon, XIcon } from "lucide-react"

import {
  calendarItemDisplayTitle,
  formatItemTimeRange,
  type CalendarFilters,
} from "@/lib/domain/calendar"
import { useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"
import { useVisibleCalendars } from "@/modules/team-calendar/hooks/useVisibleCalendars"
import {
  useCalendarSearch,
  type SearchRow,
} from "@/modules/team-calendar/hooks/useCalendarSearch"
import { AssigneeChips } from "@/modules/team-calendar/components/AssigneeChips"
import { TypeBadge } from "@/modules/team-calendar/components/TypeBadge"
import { Input } from "@/components/ui/input"
import { cn } from "@/utils/cn"

// Mục D tasks 12.1 / 12.2 / 12.5 — whole-calendar search. Results ignore the
// hidden calendars and the active filters; a hit the filters would hide off the
// grid gets a "đang bị bộ lọc ẩn" tag (task 12.5).
export function CalendarSearchPanel({
  searchRef,
  filters,
  currentUid,
  onOpenResult,
}: {
  searchRef?: React.Ref<HTMLInputElement>
  filters: CalendarFilters
  currentUid: string | null
  onOpenResult: (row: SearchRow, hiddenByFilter: boolean) => void
}) {
  const [query, setQuery] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  const { hits, loading, active } = useCalendarSearch(query, filters, currentUid)
  const { byUid } = useMembers()
  const { calendars } = useVisibleCalendars({ includeArchived: true })

  const calName = (id: string) =>
    calendars.find((c) => c.calendar.id === id)?.calendar.name ?? "—"

  const open = focused && active

  function pick(row: SearchRow, hiddenByFilter: boolean) {
    onOpenResult(row, hiddenByFilter)
    setQuery("")
    setFocused(false)
  }

  return (
    <div className="relative hidden sm:block">
      <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={searchRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("")
            e.currentTarget.blur()
          }
        }}
        placeholder="Tìm mục lịch…"
        className="h-8 w-48 pr-6 pl-7"
      />
      {query && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setQuery("")}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
          <span className="sr-only">Xoá tìm kiếm</span>
        </button>
      )}

      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute right-0 z-50 mt-1 max-h-[70vh] w-96 overflow-y-auto rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {loading && hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Đang tìm…
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Không tìm thấy mục nào
            </p>
          ) : (
            <ul>
              {hits.map(({ item, hiddenByFilter }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item, hiddenByFilter)}
                    className="flex w-full flex-col items-start gap-1 rounded px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <TypeBadge
                        type={item.type}
                        className="text-muted-foreground"
                      />
                      <span
                        className={cn(
                          "flex-1 truncate font-medium",
                          hiddenByFilter && "text-muted-foreground"
                        )}
                      >
                        {calendarItemDisplayTitle(item.title)}
                      </span>
                      {item.assigneeIds.length > 0 && (
                        <AssigneeChips
                          assigneeIds={item.assigneeIds}
                          primaryAssigneeId={item.primaryAssigneeId}
                          byUid={byUid}
                        />
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatItemTimeRange(item)} · {calName(item.calendarId)}
                    </span>
                    {hiddenByFilter && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                        <EyeOffIcon className="size-3" />
                        Đang bị bộ lọc ẩn khỏi khung nhìn
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
