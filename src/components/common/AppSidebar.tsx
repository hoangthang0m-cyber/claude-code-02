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
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/utils/cn"
import {
  FolderKanbanIcon,
  CalendarDaysIcon,
  FilesIcon,
  LightbulbIcon,
  ChartColumnBigIcon,
  MoonStarIcon,
  Settings2Icon,
} from "lucide-react"

// Mỗi icon nằm trong một viên gạch nổi — bóng đổ nhấc nó khỏi mặt sidebar
// ("bồng bềnh"). Khi mục đang mở, viên gạch chuyển sang sắc thạch anh tím và
// toả quầng sáng; khi rê chuột thì nhấc lên nhẹ.
type IconComponent = React.ComponentType<{
  className?: string
  strokeWidth?: number
}>

function NavIcon({ icon: Icon }: { icon: IconComponent }) {
  return (
    <span
      className={cn(
        "pointer-events-none relative flex size-7 shrink-0 items-center justify-center rounded-[0.6rem]",
        "bg-sidebar-accent text-sidebar-foreground ring-1 ring-border/60",
        "shadow-[0_1px_0_0_var(--sheen)_inset,0_2px_8px_-3px_var(--halo)]",
        "transition-all duration-300 ease-out",
        "group-hover/nav-item:-translate-y-0.5 group-hover/nav-item:ring-primary/45",
        "group-hover/nav-item:shadow-[0_1px_0_0_var(--sheen)_inset,0_9px_20px_-7px_var(--halo)]",
        // trạng thái đang ở trang này
        "group-data-[active=true]/nav-item:bg-[linear-gradient(140deg,color-mix(in_oklch,var(--primary),white_16%),var(--primary))]",
        "group-data-[active=true]/nav-item:text-primary-foreground",
        "group-data-[active=true]/nav-item:ring-primary/50",
        "group-data-[active=true]/nav-item:shadow-[0_1px_0_0_var(--sheen)_inset,0_8px_22px_-8px_color-mix(in_oklch,var(--primary),transparent_35%)]"
      )}
    >
      <Icon className="!size-[18px]" strokeWidth={2.05} />
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
    <Sidebar
      collapsible="offcanvas"
      className={cn(
        // mặt sidebar là kính mờ để lớp cực quang phía sau ánh qua
        "[&_[data-slot=sidebar-inner]]:rounded-2xl [&_[data-slot=sidebar-inner]]:bg-sidebar/55",
        "[&_[data-slot=sidebar-inner]]:ring-1 [&_[data-slot=sidebar-inner]]:ring-sidebar-border/70",
        "[&_[data-slot=sidebar-inner]]:shadow-[0_1px_0_0_var(--sheen)_inset,0_18px_50px_-30px_var(--halo)]",
        "[&_[data-slot=sidebar-inner]]:backdrop-blur-xl"
      )}
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/campaigns"
              className="group/brand flex items-center gap-3 rounded-xl px-1.5 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* Dấu ấn thương hiệu: trăng & sao trong viên đá viền vàng */}
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(150deg,color-mix(in_oklch,var(--primary),white_18%),var(--primary)_60%,color-mix(in_oklch,var(--primary),black_22%))] text-primary-foreground ring-1 ring-gold/40 shadow-[0_1px_0_0_var(--sheen)_inset,0_8px_22px_-8px_color-mix(in_oklch,var(--primary),transparent_30%)] transition-transform duration-500 ease-out group-hover/brand:scale-105">
                <MoonStarIcon className="size-[19px]" strokeWidth={1.9} />
                <span
                  aria-hidden
                  className="absolute -inset-1 -z-10 rounded-2xl bg-primary/25 blur-md"
                  style={{ animation: "glow-pulse 5s ease-in-out infinite" }}
                />
              </span>
              <span className="grid min-w-0 leading-tight">
                <span className="truncate font-heading text-[1.0625rem] font-semibold tracking-[0.01em]">
                  Hẻm Tarot
                </span>
                <span className="label-rune truncate text-[0.5625rem] tracking-[0.22em]">
                  Content Studio
                </span>
              </span>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
        <div aria-hidden className="rune-divider mx-1 mt-1" />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <div aria-hidden className="rune-divider mx-1 mb-1" />
        <NavUser user={navUser} />
      </SidebarFooter>
    </Sidebar>
  )
}
