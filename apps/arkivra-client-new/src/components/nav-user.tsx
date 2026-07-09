"use client"

import {
  EllipsisVertical,
  LogOut,
  CircleUser,
  Info,
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react"
import { Link } from "react-router-dom"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { authClient } from "@/lib/auth-client"
import { clearAppearanceBootstrapUserKey } from "@/lib/appearance-preferences"
import { useNavigate } from "react-router-dom"

interface SessionUserMetadata {
  name?: string | null
  email?: string | null
  image?: string | null
}

function getUserInitials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase()
  }

  if (parts.length === 1) {
    return (parts[0]?.[0] ?? "A").toUpperCase()
  }

  return (email[0] ?? "A").toUpperCase()
}

function SidebarUserAvatar({
  email,
  image,
  name,
}: {
  email: string
  image: string | null
  name: string
}) {
  return (
    <Avatar className="h-8 w-8 rounded-lg">
      <AvatarImage src={image ?? undefined} alt={name || email || "Profile photo"} />
      <AvatarFallback className="rounded-lg text-xs font-semibold">
        {getUserInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  )
}

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const navigate = useNavigate()
  const { data: sessionData } = authClient.useSession()
  const sessionUser = sessionData?.user as SessionUserMetadata | undefined
  const name = sessionUser?.name?.trim() || user.name
  const email = sessionUser?.email?.trim() || user.email
  const image = sessionUser?.image?.trim() || user.avatar || null

  async function handleSignOut() {
    clearAppearanceBootstrapUserKey()
    await authClient.signOut()
    navigate("/login", { replace: true })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer"
            >
              <SidebarUserAvatar name={name} email={email} image={image} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {email}
                </span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <SidebarUserAvatar name={name} email={email} image={image} />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/settings/account">
                  <CircleUser />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/settings/security">
                  <ShieldCheck />
                  Security
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/settings/preferences">
                  <SlidersHorizontal />
                  Preferences
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/settings/about">
                  <Info />
                  About
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={handleSignOut}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
