"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { toast } from "sonner"

import { DEFAULT_CALENDAR_ITEM_TYPE } from "@/lib/domain/calendar"
import { useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"
import { useVisibleCalendars } from "@/modules/team-calendar/hooks/useVisibleCalendars"
import { usePermissions } from "@/modules/team-calendar/hooks/usePermissions"
import { useCalendarUndo } from "@/modules/team-calendar/hooks/useCalendarUndo"
import {
  createCalendarItem,
  deleteCalendarItem,
} from "@/modules/team-calendar/services/calendarItems.client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface QuickCreateDraft {
  startMs: number
  endMs: number
  allDay: boolean
}

// task 7.1 — the quick-create popover: only a title, plus calendar / assignee,
// with "Sửa thêm" for the full form. Enter saves (loại `Nhiệm vụ`, lịch mặc
// định); Esc / click-away cancels without creating.
export function QuickCreatePopover({
  anchorRect,
  draft,
  onClose,
  onOpenFull,
}: {
  anchorRect: DOMRect | null
  draft: QuickCreateDraft | null
  onClose: () => void
  onOpenFull: (draft: QuickCreateDraft & { title: string; calendarId: string }) => void
}) {
  const { calendars } = useVisibleCalendars()
  const { members } = useMembers()
  const { isManager } = usePermissions()
  const undo = useCalendarUndo()
  const [title, setTitle] = React.useState("")
  const [calendarId, setCalendarId] = React.useState<string>("")
  const [assignee, setAssignee] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)

  const writable = calendars.filter(
    (c) => !c.calendar.archived && (isManager || c.calendar.writeScope === "everyone")
  )
  const open = !!draft && !!anchorRect

  // reset when a new draft opens
  const key = draft ? `${draft.startMs}:${draft.endMs}` : null
  const [seededKey, setSeededKey] = React.useState<string | null>(null)
  if (key !== seededKey) {
    setSeededKey(key)
    setTitle("")
    setAssignee("")
    setCalendarId(writable[0]?.calendar.id ?? "")
  }

  const virtualAnchor = React.useMemo(
    () =>
      anchorRect
        ? { getBoundingClientRect: () => anchorRect }
        : null,
    [anchorRect]
  )

  async function save() {
    if (!draft || !calendarId) {
      toast.error("Chọn lịch con")
      return
    }
    setBusy(true)
    try {
      const { id } = await createCalendarItem({
        calendarId,
        type: DEFAULT_CALENDAR_ITEM_TYPE,
        title: title.trim(),
        allDay: draft.allDay,
        startAt: new Date(draft.startMs).toISOString(),
        endAt: new Date(draft.endMs).toISOString(),
        assigneeIds: assignee ? [assignee] : [],
        primaryAssigneeId: assignee || null,
      })
      onClose()
      undo("Đã tạo mục", () => deleteCalendarItem(id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tạo được")
    } finally {
      setBusy(false)
    }
  }

  if (!open || !virtualAnchor) return null

  return (
    <PopoverPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={virtualAnchor}
          side="right"
          align="start"
          sideOffset={8}
          className="z-50"
        >
          <PopoverPrimitive.Popup className="w-64 rounded-md border bg-popover p-3 text-sm shadow-md">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose()
              }}
              className="flex flex-col gap-2"
            >
              <Input
                autoFocus
                placeholder="Tiêu đề (Nhiệm vụ)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Select value={calendarId} onValueChange={(v) => v && setCalendarId(v)}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Lịch con" />
                </SelectTrigger>
                <SelectContent>
                  {writable.map((c) => (
                    <SelectItem key={c.calendar.id} value={c.calendar.id}>
                      {c.calendar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assignee} onValueChange={(v) => setAssignee(v ?? "")}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Người đảm nhận" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.uid} value={m.uid}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    if (draft && calendarId) {
                      onClose()
                      onOpenFull({ ...draft, title, calendarId })
                    }
                  }}
                >
                  Sửa thêm
                </button>
                <Button type="submit" size="sm" disabled={busy}>
                  Lưu
                </Button>
              </div>
            </form>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
