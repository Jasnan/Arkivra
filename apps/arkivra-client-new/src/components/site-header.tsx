"use client"

import * as React from "react"
import { AppBreadcrumbs } from "@/components/layouts/app-breadcrumbs"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ModeToggle } from "@/components/mode-toggle"
import { HeaderActionsSlot } from "@/contexts/header-actions-context"
import { TransfersHeaderButton } from "@/app/transfers/transfers-header"

interface SiteHeaderProps {
  headerContent?: React.ReactNode
  headerActionsContent?: React.ReactNode
  hideHeaderSearch?: boolean
}

export function SiteHeader({ headerContent, headerActionsContent }: SiteHeaderProps) {
  const hasHeaderContent = headerContent !== undefined && headerContent !== null

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 py-3 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <div className="min-w-0 flex-1">{hasHeaderContent ? headerContent : <AppBreadcrumbs />}</div>
        <div className="ml-auto flex items-center gap-2">
          {headerActionsContent}
          <HeaderActionsSlot />
          <TransfersHeaderButton />
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
