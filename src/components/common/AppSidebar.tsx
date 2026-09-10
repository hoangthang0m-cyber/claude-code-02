"use client"

import * as React from "react"
import Link from "next/link"

import { useAuth } from "@/context/AuthContext"
import { NavMain } from "@/components/common/NavMain"
import { NavSecondary } from "@/components/common/NavSecondary"
import { NavUser } from "@/components/common/NavUser"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/utils/cn"
import {
  FolderKanbanIcon,
  CalendarDaysIcon,
  FilesIcon,
  LightbulbIcon,
  ChartColumnBigIcon,
  SparklesIcon,
  Settings2Icon,
  CommandIcon,
} from "lucide-react"

// Each nav icon sits in a small raised tile — a soft drop shadow lifts it off
// the sidebar surface ("nổi lên / bồng bềnh"), a bolder stroke + a touch more
// size makes it read clearly, and it floats up a little on hover.
type IconComponent = React.ComponentType<{
  className?: string
  strokeWidth?: number
}>

function NavIcon({ icon: Icon }: { icon: IconComponent }) {
  return (
    <span
      className={cn(
        "pointer-events-none flex size-7 shrink-0 items-center justify-center rounded-lg",
        "bg-sidebar-accent text-sidebar-foreground ring-1 ring-border/60",
        "shadow-[0_2px_8px_-2px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.08)]",
        "transition-all duration-200 ease-out",
        "group-hover/nav-item:-translate-y-0.5 group-hover/nav-item:ring-primary/40",
        "group-hover/nav-item:shadow-[0_9px_18px_-5px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.12)]"
      )}
    >
      <Icon className="!size-[18px]" strokeWidth={2.1} />
    </span>
  )
}

const data = {
  navMain: [
    { title: "Dự án", url: "/campaigns", icon: <NavIcon icon={FolderKanbanIcon} /> },
    { title: "Lịch đội", url: "/calendar", icon: <NavIcon icon={CalendarDaysIcon} /> },
    { title: "Báo cáo", url: "/reports", icon: <NavIcon icon={ChartColumnBigIcon} /> },
    { title: "Tài liệu", url: "/documents", icon: <NavIcon icon={FilesIcon} /> },
    { title: "Tri thức", url: "/knowledge", icon: <NavIcon icon={LightbulbIcon} /> },
    { title: "Trợ lý", url: "/assistant", icon: <NavIcon icon={SparklesIcon} /> },
  ],
  navSecondary: [
    { title: "Cài đặt", url: "/ad-accounts", icon: <NavIcon icon={Settings2Icon} /> },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const navUser = {
    name: user?.displayName || user?.email?.split("@")[0] || "Người dùng",
    email: user?.email ?? "",
    avatar: user?.photoURL ?? "",
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/campaigns" />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Hẻm Tarot</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={navUser} />
      </SidebarFooter>
    </Sidebar>
  )
}
