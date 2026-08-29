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
import {
  MegaphoneIcon,
  ShieldAlertIcon,
  UsersIcon,
  WalletIcon,
  FileTextIcon,
  CalendarIcon,
  FileChartColumnIcon,
  Settings2Icon,
  CircleHelpIcon,
  SearchIcon,
  CommandIcon,
} from "lucide-react"

const data = {
  navMain: [
    { title: "Dự án", url: "/campaigns", icon: <MegaphoneIcon /> },
    { title: "Rủi ro", url: "/risks", icon: <ShieldAlertIcon /> },
    { title: "Nhân sự", url: "/team", icon: <UsersIcon /> },
    { title: "Ngân sách", url: "/budget", icon: <WalletIcon /> },
    { title: "Tài liệu", url: "/documents", icon: <FileTextIcon /> },
    { title: "Cuộc họp", url: "/meetings", icon: <CalendarIcon /> },
    { title: "Báo cáo", url: "/reports", icon: <FileChartColumnIcon /> },
  ],
  navSecondary: [
    { title: "Cài đặt", url: "/ad-accounts", icon: <Settings2Icon /> },
    { title: "Trợ giúp", url: "#", icon: <CircleHelpIcon /> },
    { title: "Tìm kiếm", url: "#", icon: <SearchIcon /> },
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
