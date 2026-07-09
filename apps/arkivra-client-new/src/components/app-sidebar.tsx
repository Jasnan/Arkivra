"use client"

import * as React from "react"
import {
  Archive,
  MessageSquare,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
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
import { fetchJson, getHealth } from "@/lib/api"

interface SidebarMeResponse {
  isAdmin: boolean
}

function formatVersion(version: string) {
  return version.startsWith("v") ? version : `v${version}`
}

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
          title: "Chat",
          url: "/chat",
          icon: MessageSquare,
        },
        {
          title: "Tags",
          url: "/tags",
          icon: Tags,
        },
        {
          title: "Trash",
          url: "/trash",
          icon: Trash2,
        },
      ],
    },
    {
      label: "Administration",
      items: [
        {
          title: "Admin",
          url: "#",
          icon: ShieldCheck,
          items: [
            {
              title: "Users",
              url: "/admin/users",
            },
            {
              title: "Backups",
              url: "/admin/backups",
            },
            {
              title: "Office Converter",
              url: "/admin/office-converter",
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
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [appVersion, setAppVersion] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()

    fetchJson<SidebarMeResponse>("/api/me", { signal: controller.signal })
      .then((me) => setIsAdmin(me.isAdmin === true))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setIsAdmin(false)
      })

    return () => controller.abort()
  }, [])

  React.useEffect(() => {
    let ignore = false

    getHealth()
      .then((health) => {
        if (!ignore) {
          setAppVersion(formatVersion(health.version))
        }
      })
      .catch(() => {
        if (!ignore) {
          setAppVersion(null)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

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

  const visibleNavGroups = React.useMemo(
    () => data.navGroups.filter((group) => group.label !== "Administration" || isAdmin),
    [isAdmin]
  )

  return (
    <>
      <Sidebar {...props}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/vaults">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Logo size={24} className="text-current" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">Arkivra</span>
                    <span className="truncate text-xs">{appVersion ?? "Version unavailable"}</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SearchTrigger
            className="rounded-lg px-3 md:w-full lg:w-full group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:sm:pr-0 group-data-[collapsible=icon]:[&_kbd]:hidden group-data-[collapsible=icon]:[&_span]:hidden group-data-[collapsible=icon]:[&_svg]:mr-0"
            onClick={() => setSearchOpen(true)}
          />
        </SidebarHeader>
        <SidebarContent>
          {visibleNavGroups.map((group) => (
            <NavMain key={group.label} label={group.label} items={group.items} />
          ))}
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={data.user} />
        </SidebarFooter>
      </Sidebar>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} isAdmin={isAdmin} />
    </>
  )
}
