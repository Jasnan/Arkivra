"use client"

import * as React from "react"
import {
  Archive,
  LayoutPanelLeft,
  LayoutDashboard,
  MessageCircle,
  AlertTriangle,
  Settings,
  Search,
  Tags,
  Trash2,
  Bot,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Logo } from "@/components/logo"

import { CommandSearch, SearchTrigger } from "@/components/command-search"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "Arkivra",
    email: "store@example.com",
    avatar: "",
  },
  navGroups: [
    {
      label: "",
      items: [
        {
          title: "Vaults",
          url: "/vaults",
          icon: Archive,
        },
        {
          title: "Search",
          url: "/search",
          icon: Search,
        },
        {
          title: "Tags",
          url: "/tags",
          icon: Tags,
        },
        {
          title: "Chat",
          url: "/chat",
          icon: MessageCircle,
        },
        {
          title: "Trash",
          url: "/trash",
          icon: Trash2,
        },
      ],
    },
    {
      label: "Pages",
      items: [
        {
          title: "Errors",
          url: "#",
          icon: AlertTriangle,
          items: [
            {
              title: "Unauthorized",
              url: "/errors/unauthorized",
            },
            {
              title: "Forbidden",
              url: "/errors/forbidden",
            },
            {
              title: "Not Found",
              url: "/errors/not-found",
            },
            {
              title: "Internal Server Error",
              url: "/errors/internal-server-error",
            },
            {
              title: "Under Maintenance",
              url: "/errors/under-maintenance",
            },
          ],
        },
        {
          title: "Settings",
          url: "#",
          icon: Settings,
          items: [
            {
              title: "User Settings",
              url: "/settings/user",
            },
            {
              title: "Account Settings",
              url: "/settings/account",
            },
            {
              title: "Appearance",
              url: "/settings/appearance",
            },
            {
              title: "Notifications",
              url: "/settings/notifications",
            },
            {
              title: "Connections",
              url: "/settings/connections",
            },
          ],
        },
        {
          title: "Admin",
          url: "#",
          icon: Bot,
          items: [
            {
              title: "Users",
              url: "/admin/users",
            },
            {
              title: "Audit Log",
              url: "/admin/audit-log",
            },
            {
              title: "AI Settings",
              url: "/admin/ai-settings",
            },
          ],
        },
      ],
    },
    {
      label: "Dashboards",
      items: [
        {
          title: "Dashboard 1",
          url: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: "Dashboard 2",
          url: "/dashboard-2",
          icon: LayoutPanelLeft,
        },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [searchOpen, setSearchOpen] = React.useState(false)

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      <Sidebar {...props}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/dashboard">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Logo size={24} className="text-current" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">Arkivra</span>
                    <span className="truncate text-xs">Admin Dashboard</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SearchTrigger
            className="h-10 rounded-lg px-3 md:w-full lg:w-full group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:sm:pr-0 group-data-[collapsible=icon]:[&_kbd]:hidden group-data-[collapsible=icon]:[&_span]:hidden group-data-[collapsible=icon]:[&_svg]:mr-0"
            onClick={() => setSearchOpen(true)}
          />
        </SidebarHeader>
        <SidebarContent>
          {data.navGroups.map((group) => (
            <NavMain key={group.label} label={group.label} items={group.items} />
          ))}
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={data.user} />
        </SidebarFooter>
      </Sidebar>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}
