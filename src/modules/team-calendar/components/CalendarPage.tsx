"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { useIsMobile } from "@/hooks/useMobile"
import {
  AGENDA_PAGE_DAYS,
  viewWindow,
  vnDateKey,
  vnDayStartMs,
  type RenderableItem,
} from "@/lib/domain/calendar"
import { useAuth } from "@/context/AuthContext"
import { useVisibleCalendars } from "@/modules/team-calendar/hooks/useVisibleCalendars"
import { useExpandedRecurring } from "@/modules/team-calendar/hooks/useExpandedRecurring"
import { useCalendarItems } from "@/modules/team-calendar/hooks/useCalendarItems"
import { useCalendarView } from "@/modules/team-calendar/hooks/useCalendarView"
import { useHotkeys } from "@/modules/team-calendar/hooks/useHotkeys"
import { setShowWeekNumbers } from "@/modules/team-calendar/services/userCalendarPrefs.client"
import { CalendarSidebar } from "@/modules/team-calendar/components/CalendarSidebar"
import { CalendarToolbar } from "@/modules/team-calendar/components/CalendarToolbar"
import { MiniMonth } from "@/modules/team-calendar/components/MiniMonth"
import {
  ItemEditorForm,
  type ItemEditorSeed,
} from "@/modules/team-calendar/components/ItemEditorForm"
import {
  QuickCreatePopover,
  type QuickCreateDraft,
} from "@/modules/team-calendar/components/QuickCreatePopover"
import { AgendaList } from "@/modules/team-calendar/components/views/AgendaList"
import { DayWeekGrid } from "@/modules/team-calendar/components/views/DayWeekGrid"
import { MonthGrid } from "@/modules/team-calendar/components/views/MonthGrid"
import { YearGrid } from "@/modules/team-calendar/components/views/YearGrid"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

export function CalendarPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const { view, setView, anchor, setAnchor, goToday, step } = useCalendarView()
  const { calendars, visibleIds, prefs } = useVisibleCalendars()
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [agendaPages, setAgendaPages] = React.useState(1)
  const [editor, setEditor] = React.useState<{
    open: boolean
    item?: RenderableItem
    seed?: ItemEditorSeed
  }>({ open: false })
  const [quickCreate, setQuickCreate] = React.useState<{
    draft: QuickCreateDraft
    rect: DOMRect
  } | null>(null)

  function selectSlot(
    startMs: number,
    endMs: number,
    allDay: boolean,
    rect: DOMRect
  ) {
    setQuickCreate({ draft: { startMs, endMs, allDay }, rect })
  }

  // reset agenda paging when the view / anchor changes (render-phase adjustment)
  const paginationKey = `${view}:${anchor}`
  const [pagedFor, setPagedFor] = React.useState(paginationKey)
  if (paginationKey !== pagedFor) {
    setPagedFor(paginationKey)
    setAgendaPages(1)
  }

  const window = React.useMemo(() => {
    const base = viewWindow(view, anchor)
    if (view === "agenda") {
      return {
        startDay: base.startDay,
        endDay: vnDateKey(
          vnDayStartMs(base.startDay) +
            AGENDA_PAGE_DAYS * agendaPages * 86_400_000
        ),
      }
    }
    return base
  }, [view, anchor, agendaPages])

  const visibleIdList = React.useMemo(() => [...visibleIds], [visibleIds])
  const { items, recurringMasters } = useCalendarItems(window, visibleIdList)
  const occurrences = useExpandedRecurring(recurringMasters, window)
  const allItems = React.useMemo(
    () => [...items, ...occurrences],
    [items, occurrences]
  )

  const calendarById = React.useMemo(
    () => new Map(calendars.map((c) => [c.calendar.id, c])),
    [calendars]
  )
  const showWeekNumbers = prefs.showWeekNumbers ?? false

  useHotkeys({
    onView: setView,
    onToday: goToday,
    onPrev: () => step(-1),
    onNext: () => step(1),
    onSearch: () => searchRef.current?.focus(),
  })

  function openDay(dayKey: string) {
    setAnchor(dayKey)
    setView("day")
  }
  function editItem(item: RenderableItem) {
    setEditor({ open: true, item })
  }

  const sidebar = (
    <div className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r p-3">
      <Button
        size="sm"
        className="self-start"
        onClick={() =>
          setEditor({
            open: true,
            seed: { startMs: vnDayStartMs(anchor) + 9 * 3600_000 },
          })
        }
      >
        <PlusIcon /> Tạo mục
      </Button>
      <MiniMonth selected={anchor} onSelect={setAnchor} />
      <CalendarSidebar />
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-2 p-2 md:hidden">
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger
            render={<Button variant="outline" size="sm">Lịch & bộ lọc</Button>}
          />
          <SheetContent side="left" className="w-72 overflow-y-auto p-3">
            {sidebar}
          </SheetContent>
        </Sheet>
      </div>

      <CalendarToolbar
        view={view}
        onView={setView}
        anchor={anchor}
        onToday={goToday}
        onStep={step}
        searchRef={searchRef}
        showWeekNumbers={showWeekNumbers}
        onToggleWeekNumbers={(next) => {
          if (user) setShowWeekNumbers(user.uid, next).catch(() => undefined)
        }}
      />

      <div className="flex min-h-0 flex-1">
        {!isMobile && sidebar}
        <div className="min-w-0 flex-1 overflow-hidden">
          {(view === "day" || view === "week") && (
            <DayWeekGrid
              view={view}
              anchor={anchor}
              items={allItems}
              calendarById={calendarById}
              showWeekNumbers={showWeekNumbers}
              onEditItem={editItem}
              onSlotSelect={selectSlot}
            />
          )}
          {view === "month" && (
            <MonthGrid
              anchor={anchor}
              items={allItems}
              calendarById={calendarById}
              showWeekNumbers={showWeekNumbers}
              onEditItem={editItem}
              onOpenDay={openDay}
              onSlotSelect={selectSlot}
            />
          )}
          {view === "year" && (
            <YearGrid anchor={anchor} items={allItems} onOpenDay={openDay} />
          )}
          {view === "agenda" && (
            <AgendaList
              windowStartDay={window.startDay}
              windowEndDay={window.endDay}
              items={allItems}
              calendarById={calendarById}
              onEditItem={editItem}
              onLoadMore={() => setAgendaPages((p) => p + 1)}
            />
          )}
        </div>
      </div>

      <ItemEditorForm
        open={editor.open}
        onOpenChange={(open) => setEditor((e) => ({ ...e, open }))}
        item={editor.item}
        seed={editor.seed}
      />

      <QuickCreatePopover
        anchorRect={quickCreate?.rect ?? null}
        draft={quickCreate?.draft ?? null}
        onClose={() => setQuickCreate(null)}
        onOpenFull={(d) => {
          setQuickCreate(null)
          setEditor({
            open: true,
            seed: {
              startMs: d.startMs,
              endMs: d.endMs,
              allDay: d.allDay,
              calendarId: d.calendarId,
            },
          })
        }}
      />
    </div>
  )
}
