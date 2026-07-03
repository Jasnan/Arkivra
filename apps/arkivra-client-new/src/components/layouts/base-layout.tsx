"use client"

import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import { cn } from "@/lib/utils"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

interface BaseLayoutProps {
  children: React.ReactNode
  title?: string
  description?: string
  headerContent?: React.ReactNode
  headerActionsContent?: React.ReactNode
  hideHeaderSearch?: boolean
  contentClassName?: string
}

export function BaseLayout({ children, title, description, headerContent, headerActionsContent, hideHeaderSearch, contentClassName }: BaseLayoutProps) {
  const { config } = useSidebarConfig()

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem", 
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
      className={config.collapsible === "none" ? "sidebar-none-mode" : ""}
    >
      {config.side === "left" ? (
        <>
          <AppSidebar 
            variant={config.variant} 
            collapsible={config.collapsible} 
            side={config.side} 
          />
          <SidebarInset>
            <SiteHeader headerContent={headerContent} headerActionsContent={headerActionsContent} hideHeaderSearch={hideHeaderSearch} />
            <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", contentClassName)}>
              <div className="@container/main flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex min-h-0 flex-col gap-4 py-4 md:gap-6 md:py-6">
                  {title && (
                    <div className="px-4 lg:px-6">
                      <div className="flex flex-col gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                        {description && (
                          <p className="text-muted-foreground">{description}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {children}
                </div>
              </div>
            </div>
          </SidebarInset>
        </>
      ) : (
        <>
          <SidebarInset>
            <SiteHeader headerContent={headerContent} headerActionsContent={headerActionsContent} hideHeaderSearch={hideHeaderSearch} />
            <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", contentClassName)}>
              <div className="@container/main flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex min-h-0 flex-col gap-4 py-4 md:gap-6 md:py-6">
                  {title && (
                    <div className="px-4 lg:px-6">
                      <div className="flex flex-col gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                        {description && (
                          <p className="text-muted-foreground">{description}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {children}
                </div>
              </div>
            </div>
          </SidebarInset>
          <AppSidebar 
            variant={config.variant} 
            collapsible={config.collapsible} 
            side={config.side} 
          />
        </>
      )}
    </SidebarProvider>
  )
}
