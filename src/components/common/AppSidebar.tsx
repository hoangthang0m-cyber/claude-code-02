"use client"

import * as React from "react"

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
  ListTodoIcon,
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
    { title: "Tasks", url: "/tasks", icon: <ListTodoIcon /> },
    { title: "Risks", url: "/risks", icon: <ShieldAlertIcon /> },
    { title: "Team", url: "/team", icon: <UsersIcon /> },
    { title: "Budget", url: "/budget", icon: <WalletIcon /> },
    { title: "Documents", url: "/documents", icon: <FileTextIcon /> },
    { title: "Meetings", url: "/meetings", icon: <CalendarIcon /> },
    { title: "Reports", url: "/reports", icon: <FileChartColumnIcon /> },
  ],
  navSecondary: [
    { title: "Settings", url: "#", icon: <Settings2Icon /> },
    { title: "Get Help", url: "#", icon: <CircleHelpIcon /> },
    { title: "Search", url: "#", icon: <SearchIcon /> },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const navUser = {
    name: user?.displayName || user?.email?.split("@")[0] || "User",
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
              render={<a href="/tasks" />}
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
