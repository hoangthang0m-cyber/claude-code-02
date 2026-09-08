"use client"

import * as React from "react"
import { doc, onSnapshot } from "firebase/firestore"
import {
  CopyIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { db } from "@/firebase/config"
import {
  CALENDAR_COLLECTIONS,
  calendarItemDisplayTitle,
  canEditCalendarItem,
  formatItemTimeRange,
  type RenderableItem,
} from "@/lib/domain/calendar"
import { useCalendarSettings, useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"
import { usePermissions } from "@/modules/team-calendar/hooks/usePermissions"
import { useVisibleCalendars } from "@/modules/team-calendar/hooks/useVisibleCalendars"
import {
  deleteCalendarItem,
  duplicateCalendarItem,
} from "@/modules/team-calendar/services/calendarItems.client"
import { TypeBadge } from "@/modules/team-calendar/components/TypeBadge"
import { AssigneeChips } from "@/modules/team-calendar/components/AssigneeChips"
import { RecurrenceScopeDialog } from "@/modules/team-calendar/components/RecurrenceScopeDialog"
import { useCalendarUndo } from "@/modules/team-calendar/hooks/useCalendarUndo"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// task 5.1 — the detail popover. task 5.4 — project link opens a new tab.
// task 5.5 — if the item is deleted elsewhere while open, close with a note.
export function ItemPopover({
  item,
  trigger,
  onEdit,
  onDuplicated,
}: {
  item: RenderableItem
  trigger: React.ReactElement
  onEdit: (item: RenderableItem) => void
  onDuplicated?: (newId: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const { isManager, uid } = usePermissions()
  const { byUid } = useMembers()
  useCalendarSettings()
  const { calendars } = useVisibleCalendars({ includeArchived: true })
  const [busy, setBusy] = React.useState(false)
  const [askDeleteScope, setAskDeleteScope] = React.useState(false)
  const undo = useCalendarUndo()

  const editable =
    !!uid &&
    canEditCalendarItem(
      { createdBy: item.createdBy, assigneeIds: item.assigneeIds },
      { uid, role: isManager ? "manager" : "staff" }
    )

  // task 5.5 — watch this item; close if it vanishes / gets soft-deleted.
  React.useEffect(() => {
    if (!open) return
    return onSnapshot(
      doc(db, CALENDAR_COLLECTIONS.calendarItems, item.id),
      (snap) => {
        if (!snap.exists() || snap.data()?.deletedAt) {
          setOpen(false)
          toast("Mục lịch đã bị xoá")
        }
      }
    )
  }, [open, item.id])

  const calendar = calendars.find((c) => c.calendar.id === item.calendarId)

  async function handleDelete() {
    // task 8.5 — a recurring occurrence asks the scope first
    if (item.occurrence) {
      setOpen(false)
      setAskDeleteScope(true)
      return
    }
    setBusy(true)
    try {
      await deleteCalendarItem(item.id)
      setOpen(false)
      undo("Đã xoá mục", () =>
        import("@/modules/team-calendar/services/calendarItems.client").then(
          (m) => m.restoreCalendarItem(item.id)
        )
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xoá được")
    } finally {
      setBusy(false)
    }
  }

  async function handleDuplicate() {
    setBusy(true)
    try {
      const { id } = await duplicateCalendarItem(item.id)
      setOpen(false)
      onDuplicated?.(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không nhân bản được")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    {item.occurrence && (
      <RecurrenceScopeDialog
        open={askDeleteScope}
        action="delete"
        onCancel={() => setAskDeleteScope(false)}
        onPick={async (scope) => {
          setAskDeleteScope(false)
          try {
            await deleteCalendarItem(item.occurrence!.masterId, {
              scope,
              occurrenceKey: item.occurrence!.occurrenceKey,
            })
            toast("Đã xoá")
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Không xoá được")
          }
        }}
      />
    )}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        className="w-80"
        style={
          calendar ? { borderLeft: `3px solid ${calendar.effectiveHex}` } : undefined
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <TypeBadge type={item.type} className="mt-1 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">
                {calendarItemDisplayTitle(item.title)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatItemTimeRange(item)}
              </p>
            </div>
          </div>

          {calendar && (
            <p className="text-xs text-muted-foreground">
              Lịch: {calendar.calendar.name}
            </p>
          )}

          {item.assigneeIds.length > 0 && (
            <AssigneeChips
              assigneeIds={item.assigneeIds}
              primaryAssigneeId={item.primaryAssigneeId}
              byUid={byUid}
              expanded
            />
          )}

          {item.location && (
            <p className="flex items-center gap-1.5 text-sm">
              <MapPinIcon className="size-3.5 text-muted-foreground" />
              {item.location}
            </p>
          )}

          {item.description && (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {item.description}
            </p>
          )}

          {item.linkedProjectId && (
            <a
              href={`/campaigns/${item.linkedProjectId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLinkIcon className="size-3.5" />
              Mở dự án liên kết
            </a>
          )}

          {editable && (
            <div className="mt-1 flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpen(false)
                  onEdit(item)
                }}
              >
                <PencilIcon /> Sửa
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={handleDuplicate}
              >
                <CopyIcon /> Nhân bản
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={handleDelete}
              >
                <Trash2Icon /> Xoá
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
    </>
  )
}
