"use client"

import * as React from "react"
import { toast } from "sonner"

import type { Calendar, CalendarDeleteMode } from "@/lib/domain/calendar"
import { deleteCalendar } from "@/modules/team-calendar/services/calendars.client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// task 4.4 — deleting a sub-calendar that still holds items asks what to do with
// them: move to another calendar, or delete them too. Always a confirm step.
export function DeleteCalendarDialog({
  calendar,
  otherCalendars,
  itemCount,
  trigger,
  onDeleted,
}: {
  calendar: Calendar
  otherCalendars: { id: string; name: string }[]
  itemCount: number
  trigger: React.ReactElement
  onDeleted?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [mode, setMode] = React.useState<CalendarDeleteMode>("reassign")
  const [target, setTarget] = React.useState<string>(otherCalendars[0]?.id ?? "")
  const [busy, setBusy] = React.useState(false)

  const hasItems = itemCount > 0
  const canReassign = otherCalendars.length > 0

  async function handleConfirm() {
    setBusy(true)
    try {
      const effectiveMode: CalendarDeleteMode = hasItems ? mode : "deleteItems"
      await deleteCalendar(
        calendar.id,
        effectiveMode,
        effectiveMode === "reassign" ? target : null
      )
      toast.success(
        hasItems && effectiveMode === "reassign"
          ? `Đã xoá lịch, chuyển ${itemCount} mục`
          : "Đã xoá lịch con"
      )
      setOpen(false)
      onDeleted?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Xoá lịch “{calendar.name}”?</DialogTitle>
          {hasItems && (
            <DialogDescription>
              Lịch này còn {itemCount} mục. Chọn xử lý các mục đó:
            </DialogDescription>
          )}
        </DialogHeader>

        {hasItems && (
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="delete-mode"
                className="mt-1"
                checked={mode === "reassign"}
                disabled={!canReassign}
                onChange={() => setMode("reassign")}
              />
              <span className="flex-1">
                Chuyển các mục sang lịch khác
                {mode === "reassign" && canReassign && (
                  <Select
                    value={target}
                    onValueChange={(v) => v && setTarget(v)}
                  >
                    <SelectTrigger className="mt-1.5 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {otherCalendars.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!canReassign && (
                  <span className="block text-xs text-muted-foreground">
                    (không có lịch con nào khác)
                  </span>
                )}
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="delete-mode"
                className="mt-1"
                checked={mode === "deleteItems"}
                onChange={() => setMode("deleteItems")}
              />
              <span>Xoá luôn {itemCount} mục</span>
            </label>
          </div>
        )}

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                Huỷ
              </Button>
            }
          />
          <Button
            type="button"
            variant="destructive"
            disabled={busy || (hasItems && mode === "reassign" && !target)}
            onClick={handleConfirm}
          >
            Xoá lịch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
