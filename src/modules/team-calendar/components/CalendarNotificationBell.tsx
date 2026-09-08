"use client"

import * as React from "react"
import { BellIcon, CheckCheckIcon, ClockIcon } from "lucide-react"

import { SNOOZE_PRESETS_MINUTES } from "@/lib/domain/calendar"
import {
  useCalendarNotifications,
  type BellItem,
} from "@/modules/team-calendar/hooks/useCalendarNotifications"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/utils/cn"

function timeAgo(ms: number | null): string {
  if (ms == null) return ""
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return "vừa xong"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} phút trước`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} ngày trước`
  return new Date(ms).toLocaleDateString("vi-VN")
}

const SNOOZE_LABEL: Record<number, string> = { 5: "5 phút", 30: "30 phút", 60: "1 giờ" }

// The calendar's in-app bell (Mục D task 10.8). Realtime feed, unread badge,
// mark-read, snooze on reminder rows, and "bấm mở đúng mục trên lịch".
export function CalendarNotificationBell({
  onOpenItem,
}: {
  onOpenItem: (itemId: string, occurrenceKey: string | null) => void
}) {
  const { items, unreadCount, loading, markOne, markAll, snooze } =
    useCalendarNotifications()

  function open(n: BellItem) {
    if (n.readAtMs == null) markOne(n.id)
    onOpenItem(n.itemId, n.occurrenceKey)
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              unreadCount > 0
                ? `Thông báo lịch, ${unreadCount} chưa đọc`
                : "Thông báo lịch"
            }
            className="relative"
          >
            <BellIcon className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Thông báo</span>
          <Button
            variant="ghost"
            size="xs"
            disabled={unreadCount === 0}
            onClick={() => markAll()}
          >
            <CheckCheckIcon className="size-3" />
            Đánh dấu tất cả đã đọc
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Đang tải…
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Không có thông báo
            </p>
          ) : (
            <ul>
              {items.map((n) => {
                const unread = n.readAtMs == null
                return (
                  <li key={n.id} className="border-b last:border-0">
                    <PopoverClose
                      render={
                        <button
                          type="button"
                          onClick={() => open(n)}
                          className={cn(
                            "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                            unread && "bg-primary/5"
                          )}
                        />
                      }
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          unread ? "bg-primary" : "bg-transparent"
                        )}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className={cn(unread && "font-medium")}>
                          {n.message}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(n.createdAtMs)}
                        </span>
                      </span>
                    </PopoverClose>
                    {n.kind === "reminder" && (
                      <div className="flex items-center gap-1 px-3 pb-2 pl-7">
                        <ClockIcon className="size-3 text-muted-foreground" />
                        {SNOOZE_PRESETS_MINUTES.map((m) => (
                          <Button
                            key={m}
                            variant="ghost"
                            size="xs"
                            onClick={() => snooze(n.id, m)}
                          >
                            {SNOOZE_LABEL[m] ?? `${m}′`}
                          </Button>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
