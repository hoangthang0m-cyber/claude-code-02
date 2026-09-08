"use client"

import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import type { VisibleCalendar } from "@/lib/domain/calendar"
import { useAuth } from "@/context/AuthContext"
import { useVisibleCalendars } from "@/modules/team-calendar/hooks/useVisibleCalendars"
import { usePermissions } from "@/modules/team-calendar/hooks/usePermissions"
import { setCalendarArchived } from "@/modules/team-calendar/services/calendars.client"
import { setCalendarHidden } from "@/modules/team-calendar/services/userCalendarPrefs.client"
import { CalendarFormDialog } from "@/modules/team-calendar/components/CalendarFormDialog"
import { DeleteCalendarDialog } from "@/modules/team-calendar/components/DeleteCalendarDialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/utils/cn"

// task 4.1 — "Lịch của tôi" sidebar: hide/show + colour dot per sub-calendar.
// Manager also gets create / edit / archive / delete (tasks 4.3–4.5).
export function CalendarSidebar({ itemCounts }: { itemCounts?: Record<string, number> }) {
  const { user } = useAuth()
  const { isManager } = usePermissions()
  const [showArchived, setShowArchived] = React.useState(false)
  const { calendars, prefs } = useVisibleCalendars({ includeArchived: showArchived })

  const personal = calendars.filter((c) => c.calendar.kind === "personal")
  const shared = calendars.filter((c) => c.calendar.kind === "shared")

  async function toggleHidden(calendarId: string, nextHidden: boolean) {
    if (!user) return
    try {
      await setCalendarHidden(user.uid, prefs.hidden, calendarId, nextHidden)
    } catch {
      toast.error("Không lưu được lựa chọn ẩn/hiện")
    }
  }

  const row = (vc: VisibleCalendar) => (
    <li key={vc.calendar.id} className="group flex items-center gap-2 py-1">
      <Checkbox
        checked={!vc.hidden}
        disabled={vc.calendar.archived}
        onCheckedChange={(c) => toggleHidden(vc.calendar.id, c !== true)}
        style={
          !vc.hidden
            ? { backgroundColor: vc.effectiveHex, borderColor: vc.effectiveHex }
            : { borderColor: vc.effectiveHex }
        }
      />
      <span
        className={cn(
          "flex-1 truncate text-sm",
          vc.calendar.archived && "text-muted-foreground italic"
        )}
      >
        {vc.calendar.name}
        {vc.calendar.archived && " (đã lưu trữ)"}
      </span>

      {isManager && vc.calendar.kind === "shared" && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100"
              />
            }
          >
            <MoreVerticalIcon />
            <span className="sr-only">Tuỳ chọn lịch</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <CalendarFormDialog
              mode="edit"
              calendar={vc.calendar}
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <PencilIcon /> Sửa
                </DropdownMenuItem>
              }
            />
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  await setCalendarArchived(
                    vc.calendar.id,
                    !vc.calendar.archived
                  )
                  toast.success(
                    vc.calendar.archived ? "Đã bỏ lưu trữ" : "Đã lưu trữ lịch"
                  )
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Có lỗi xảy ra"
                  )
                }
              }}
            >
              {vc.calendar.archived ? (
                <>
                  <ArchiveRestoreIcon /> Bỏ lưu trữ
                </>
              ) : (
                <>
                  <ArchiveIcon /> Lưu trữ
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DeleteCalendarDialog
              calendar={vc.calendar}
              itemCount={itemCounts?.[vc.calendar.id] ?? 0}
              otherCalendars={shared
                .filter((s) => s.calendar.id !== vc.calendar.id)
                .map((s) => ({ id: s.calendar.id, name: s.calendar.name }))}
              trigger={
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => e.preventDefault()}
                >
                  <Trash2Icon /> Xoá
                </DropdownMenuItem>
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )

  return (
    <div className="flex flex-col gap-3">
      <section>
        <h3 className="mb-1 text-xs font-medium text-muted-foreground uppercase">
          Lịch của tôi
        </h3>
        <ul>{personal.map(row)}</ul>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground uppercase">
            Lịch dùng chung
          </h3>
          {isManager && (
            <CalendarFormDialog
              mode="create"
              trigger={
                <Button variant="ghost" size="icon-sm">
                  <PlusIcon />
                  <span className="sr-only">Lịch con mới</span>
                </Button>
              }
            />
          )}
        </div>
        <ul>{shared.map(row)}</ul>
      </section>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox
          checked={showArchived}
          onCheckedChange={(c) => setShowArchived(c === true)}
        />
        Hiện lịch đã lưu trữ
      </label>
    </div>
  )
}
