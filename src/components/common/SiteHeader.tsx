"use client"

import { usePathname } from "next/navigation"

import { NotificationBell } from "@/modules/notifications/components/NotificationBell"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const PAGE_TITLES: Record<string, string> = {
  "/campaigns": "Chiến dịch",
  "/risks": "Risks",
  "/team": "Team",
  "/budget": "Budget",
  "/documents": "Documents",
  "/meetings": "Meetings",
  "/reports": "Dashboard & báo cáo",
}

export function SiteHeader() {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? "Hẻm Tarot"

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto">
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
