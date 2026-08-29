"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { BellIcon, CheckCheckIcon } from "lucide-react"

import { notificationHref } from "@/modules/notifications/services/notifications.client"
import { useNotifications } from "@/modules/notifications/hooks/useNotifications"
import { Button } from "@/components/ui/button"
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

export function NotificationBell() {
  const router = useRouter()
  const { items, unreadCount, loading, markOne, markAll } = useNotifications()
  const [open, setOpen] = React.useState(false)

  function openNotification(id: string, href: string) {
    markOne(id)
    setOpen(false)
    router.push(href)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              unreadCount > 0
                ? `Thông báo, ${unreadCount} chưa đọc`
                : "Thông báo"
            }
            className="relative"
          />
        }
      >
        <BellIcon className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={6}>
          <PopoverPrimitive.Popup className="z-50 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
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

            <div className="flex-1 overflow-y-auto">
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
                    const unread = n.read_at == null
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() =>
                            openNotification(n.id, notificationHref(n))
                          }
                          className={cn(
                            "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                            unread && "bg-primary/5"
                          )}
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
                              {timeAgo(n.created_at)}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
