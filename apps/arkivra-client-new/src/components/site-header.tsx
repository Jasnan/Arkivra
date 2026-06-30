"use client"

import * as React from "react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { CommandSearch, SearchTrigger } from "@/components/command-search"
import { ModeToggle } from "@/components/mode-toggle"
import { HeaderActionsSlot } from "@/contexts/header-actions-context"

interface SiteHeaderProps {
  headerContent?: React.ReactNode
  headerActionsContent?: React.ReactNode
  hideHeaderSearch?: boolean
}

export function SiteHeader({ headerContent, headerActionsContent, hideHeaderSearch }: SiteHeaderProps) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const hasHeaderContent = headerContent !== undefined && headerContent !== null

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <div className="flex w-full items-center gap-1 px-4 py-3 lg:gap-2 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          {hasHeaderContent ? (
            <div className="min-w-0 flex-1">{headerContent}</div>
          ) : hideHeaderSearch ? (
            <div className="min-w-0 flex-1" />
          ) : (
            <div className="max-w-sm flex-1">
              <SearchTrigger onClick={() => setSearchOpen(true)} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {headerActionsContent}
            <HeaderActionsSlot />
            <ModeToggle />
          </div>
        </div>
      </header>
      {hasHeaderContent || hideHeaderSearch ? null : <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />}
    </>
  )
}
