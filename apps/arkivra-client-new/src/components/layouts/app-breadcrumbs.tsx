"use client"

import * as React from "react"
import { Link, useLocation } from "react-router-dom"

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "@/lib/utils"
import {
  getDocument,
  listDeletedDocuments,
  listFolderItems,
  listVaults,
  type FolderBreadcrumb,
} from "@/app/vaults/vaults.api"

const BREADCRUMB_LABEL_MAX_LENGTH = 10

export interface BreadcrumbEntry {
  label: string
  to?: string
}

interface VaultBreadcrumbEntry extends BreadcrumbEntry {
  key: string
}

function truncateBreadcrumbLabel(label: string, maxLength = BREADCRUMB_LABEL_MAX_LENGTH) {
  if (label.length <= maxLength) {
    return label
  }

  return `${label.slice(0, maxLength - 3).trimEnd()}...`
}

function getVisibleBreadcrumbs<T>(breadcrumbs: T[]) {
  if (breadcrumbs.length <= 4) {
    return breadcrumbs
  }

  return [
    breadcrumbs[0],
    breadcrumbs[1],
    null,
    breadcrumbs.at(-2)!,
    breadcrumbs.at(-1)!,
  ]
}

function buildBreadcrumbs({
  pathname,
  vaultId,
  vaultName,
  documentName,
}: {
  pathname: string
  vaultId?: string | null
  vaultName?: string
  documentName?: string
}): BreadcrumbEntry[] {
  const parts = pathname.split("/").filter(Boolean)
  const currentDocumentLabel = documentName ?? "Document"

  if (parts.length === 0) return [{ label: "Dashboard", to: "/dashboard" }]
  if (pathname === "/dashboard") return [{ label: "Dashboard" }]
  if (pathname === "/vaults") return [{ label: "Vaults" }]
  if (pathname === "/trash") return [{ label: "Trash" }]
  if (parts[0] === "trash" && parts[1]) return [{ label: "Trash", to: "/trash" }, { label: currentDocumentLabel }]
  if (pathname === "/tags") return [{ label: "Tags" }]
  if (pathname === "/search") return [{ label: "Search" }]
  if (parts[0] === "chat") return [{ label: "Chat" }]

  if (parts[0] === "settings") {
    const settingsLabels: Record<string, string> = {
      account: "Profile",
      security: "Security",
      appearance: "Appearance",
      notifications: "Notifications",
      connections: "Connections",
    }
    const sectionLabel = settingsLabels[parts[1] ?? ""]
    return sectionLabel ? [{ label: "Settings", to: "/settings/account" }, { label: sectionLabel }] : [{ label: "Settings" }]
  }

  if (parts[0] === "admin") {
    const adminLabels: Record<string, string> = {
      "ai-settings": "AI Settings",
      "audit-log": "Audit Log",
      users: "Users",
    }
    const sectionLabel = adminLabels[parts[1] ?? ""]
    return sectionLabel ? [{ label: "Admin", to: "/admin/ai-settings" }, { label: sectionLabel }] : [{ label: "Admin" }]
  }

  if (parts[0] === "vaults" && parts[1]) {
    const activeVaultId = vaultId ?? parts[1]
    const vaultLabel = vaultName ?? "Vault"
    const base: BreadcrumbEntry[] = [
      { label: "Vaults", to: "/vaults" },
      { label: vaultLabel, to: `/vaults/${activeVaultId}` },
    ]

    if (parts.length === 2) return base
    if (parts[2]) return [...base, { label: currentDocumentLabel }]

    return base
  }

  return [{ label: "Arkivra" }]
}

function buildVaultBreadcrumbs({
  vaultId,
  vaultName,
  breadcrumbs,
}: {
  vaultId: string
  vaultName?: string
  breadcrumbs: FolderBreadcrumb[]
}): VaultBreadcrumbEntry[] {
  return [
    { key: "vaults", label: "Vaults", to: "/vaults" },
    {
      key: `vault-${vaultId}`,
      label: vaultName || "Vault",
      to: `/vaults/${vaultId}`,
    },
    ...breadcrumbs.map((folder) => ({
      key: `folder-${folder.id}`,
      label: folder.name,
      to: `/vaults/${vaultId}?folderId=${folder.id}`,
    })),
  ]
}

export function AppBreadcrumbs() {
  const location = useLocation()
  const [vaultName, setVaultName] = React.useState<string | undefined>()
  const [documentName, setDocumentName] = React.useState<string | undefined>()
  const [folderBreadcrumbs, setFolderBreadcrumbs] = React.useState<FolderBreadcrumb[]>([])

  const pathname = location.pathname
  const search = location.search
  const parts = React.useMemo(() => pathname.split("/").filter(Boolean), [pathname])
  const vaultId = parts[0] === "vaults" ? parts[1] : undefined
  const documentId = parts[0] === "vaults" || parts[0] === "trash" ? parts[2] ?? parts[1] : undefined
  const folderId = React.useMemo(() => new URLSearchParams(search).get("folderId"), [search])
  const isVaultWorkspaceRoute = parts[0] === "vaults" && parts.length === 2

  React.useEffect(() => {
    let ignore = false

    async function loadBreadcrumbData() {
      try {
        if (parts[0] === "vaults" && vaultId) {
          const vaultsResult = await listVaults()
          const nextVaultName = vaultsResult.vaults.find((vault) => vault.id === vaultId)?.name

          if (!ignore) {
            setVaultName(nextVaultName)
          }

          if (isVaultWorkspaceRoute) {
            const folderResult = await listFolderItems({
              vaultId,
              folderId: folderId && folderId !== "root" ? folderId : null,
            })

            if (!ignore) {
              setFolderBreadcrumbs(folderResult.breadcrumbs)
            }
          } else if (parts[2]) {
            const documentResult = await getDocument({ vaultId, documentId: parts[2] })

            if (!ignore) {
              setDocumentName(documentResult.document.name)
            }
          }

          return
        }

        if (parts[0] === "trash" && parts[1]) {
          const deletedDocumentsResult = await listDeletedDocuments()
          const deletedDocument = deletedDocumentsResult.documents.find((document) => document.id === parts[1])

          if (!ignore) {
            setDocumentName(deletedDocument?.name)
          }
        }
      } catch {
        if (!ignore) {
          setFolderBreadcrumbs([])
        }
      }
    }

    void loadBreadcrumbData()

    return () => {
      ignore = true
    }
  }, [documentId, folderId, isVaultWorkspaceRoute, parts, vaultId])

  if (isVaultWorkspaceRoute) {
    const entries = buildVaultBreadcrumbs({
      vaultId: vaultId ?? "",
      vaultName,
      breadcrumbs: folderBreadcrumbs,
    })

    return <VaultRouteBreadcrumbs entries={entries} />
  }

  return (
    <DefaultBreadcrumbs
      breadcrumbs={buildBreadcrumbs({
        pathname,
        vaultId,
        vaultName,
        documentName,
      })}
    />
  )
}

function DefaultBreadcrumbs({ breadcrumbs }: { breadcrumbs: BreadcrumbEntry[] }) {
  const visibleBreadcrumbs = getVisibleBreadcrumbs(breadcrumbs)
  const animationKey = visibleBreadcrumbs
    .map((item) => item ? `${item.to ?? ""}:${item.label}` : "ellipsis")
    .join("|")

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList key={animationKey} className="subtle-opacity-enter flex-nowrap text-muted-foreground">
        {visibleBreadcrumbs.map((item, index) => {
          const isLast = index === visibleBreadcrumbs.length - 1

          if (item === null) {
            return (
              <React.Fragment key="breadcrumb-ellipsis">
                {index > 0 ? <BreadcrumbSeparator className="text-muted-foreground" /> : null}
                <BreadcrumbItem className="shrink-0">
                  <span aria-hidden="true" className="text-muted-foreground">...</span>
                </BreadcrumbItem>
              </React.Fragment>
            )
          }

          const label = truncateBreadcrumbLabel(item.label)

          return (
            <React.Fragment key={`${item.to ?? item.label}-${item.label}`}>
              {index > 0 ? <BreadcrumbSeparator className="text-muted-foreground" /> : null}
              <BreadcrumbItem className={cn("min-w-0", isLast ? "shrink" : "shrink-0")}>
                {item.to && !isLast ? (
                  <BreadcrumbLink asChild>
                    <Link to={item.to} className="min-w-0 font-medium text-inherit">
                      <span title={item.label} className="block truncate">
                        {label}
                      </span>
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage title={item.label} className="truncate">
                    {label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function VaultRouteBreadcrumbs({ entries }: { entries: VaultBreadcrumbEntry[] }) {
  const visibleEntries = getVisibleBreadcrumbs(entries)
  const animationKey = visibleEntries
    .map((entry) => entry ? `${entry.key}:${entry.label}` : "ellipsis")
    .join("|")

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList key={animationKey} className="subtle-opacity-enter flex-nowrap">
        {visibleEntries.map((entry, index) => {
          const isLast = index === visibleEntries.length - 1

          if (entry === null) {
            return (
              <React.Fragment key="breadcrumb-ellipsis">
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem className="shrink-0">
                  <BreadcrumbEllipsis className="size-auto px-0.5" />
                </BreadcrumbItem>
              </React.Fragment>
            )
          }

          const label = truncateBreadcrumbLabel(entry.label)

          return (
            <React.Fragment key={entry.key}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className={cn("min-w-0", isLast ? "shrink" : "shrink-0")}>
                {entry.to && !isLast ? (
                  <BreadcrumbLink asChild>
                    <Link to={entry.to} className="min-w-0 font-medium text-inherit">
                      <span title={entry.label} className="block truncate">
                        {label}
                      </span>
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage title={entry.label} className="min-w-0 truncate">
                    <span className="block truncate">{label}</span>
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
