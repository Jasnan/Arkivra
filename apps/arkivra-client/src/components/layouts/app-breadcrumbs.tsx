"use client"

import * as React from "react"
import { Link, matchRoutes, useLocation, type RouteObject } from "react-router-dom"

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
import {
  routes,
  type BreadcrumbContext,
  type BreadcrumbEntryConfig,
  type RouteConfig,
} from "@/config/routes"

export interface BreadcrumbEntry {
  label: string
  to?: string
}

interface VaultBreadcrumbEntry extends BreadcrumbEntry {
  key: string
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

function resolveBreadcrumbValue(
  value: BreadcrumbEntryConfig["label"] | BreadcrumbEntryConfig["to"] | undefined,
  context: BreadcrumbContext,
) {
  if (typeof value === "function") {
    return value(context)
  }

  return value
}

function resolveConfiguredBreadcrumb(
  item: BreadcrumbEntryConfig,
  context: BreadcrumbContext,
): BreadcrumbEntry {
  return {
    label: resolveBreadcrumbValue(item.label, context) ?? "Arkivra",
    to: resolveBreadcrumbValue(item.to, context),
  }
}

function pushBreadcrumb(entries: BreadcrumbEntry[], entry: BreadcrumbEntry) {
  const previous = entries.at(-1)

  if (previous?.label === entry.label && previous.to === entry.to) {
    return
  }

  entries.push(entry)
}

function buildRouteBreadcrumbs({
  documentName,
  pathname,
  vaultId,
  vaultName,
}: {
  documentName?: string
  pathname: string
  vaultId?: string | null
  vaultName?: string
}): BreadcrumbEntry[] {
  const matches = matchRoutes(routes as unknown as RouteObject[], pathname) ?? []
  const context: BreadcrumbContext = {
    documentName,
    vaultId: vaultId ?? undefined,
    vaultName,
  }
  const entries: BreadcrumbEntry[] = []

  matches.forEach((match) => {
    const route = match.route as RouteConfig
    const config = route.breadcrumb
    if (!config) return

    config.parents?.forEach((parent) => {
      pushBreadcrumb(entries, resolveConfiguredBreadcrumb(parent, context))
    })

    const entry = resolveConfiguredBreadcrumb(config, context)
    const isCurrentPath = match.pathname === pathname
    pushBreadcrumb(entries, {
      ...entry,
      to: isCurrentPath ? undefined : entry.to ?? match.pathname,
    })
  })

  if (entries.length > 0) return entries
  if (pathname === "/") return [{ label: "Vaults", to: "/vaults" }]

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
  const isVaultDocumentRoute = parts[0] === "vaults"
    && parts.length === 3
    && parts[2] !== "settings"
    && parts[2] !== "activity"
  const isTrashDocumentRoute = parts[0] === "trash" && parts.length === 2
  const documentId = isVaultDocumentRoute ? parts[2] : isTrashDocumentRoute ? parts[1] : undefined
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
          } else if (isVaultDocumentRoute && documentId) {
            const documentResult = await getDocument({ vaultId, documentId })

            if (!ignore) {
              setDocumentName(documentResult.document.name)
            }

            if (documentResult.document.folderId) {
              const folderResult = await listFolderItems({
                vaultId,
                folderId: documentResult.document.folderId,
              })

              if (!ignore) {
                setFolderBreadcrumbs(folderResult.breadcrumbs)
              }
            } else if (!ignore) {
              setFolderBreadcrumbs([])
            }
          } else if (!ignore) {
            setDocumentName(undefined)
            setFolderBreadcrumbs([])
          }

          return
        }

        if (isTrashDocumentRoute && documentId) {
          const deletedDocumentsResult = await listDeletedDocuments()
          const deletedDocument = deletedDocumentsResult.documents.find((document) => document.id === documentId)

          if (!ignore) {
            setDocumentName(deletedDocument?.name)
          }

          return
        }

        if (!ignore) {
          setDocumentName(undefined)
          setFolderBreadcrumbs([])
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
  }, [documentId, folderId, isTrashDocumentRoute, isVaultDocumentRoute, isVaultWorkspaceRoute, parts, vaultId])

  if (isVaultWorkspaceRoute) {
    const entries = buildVaultBreadcrumbs({
      vaultId: vaultId ?? "",
      vaultName,
      breadcrumbs: folderBreadcrumbs,
    })

    return <VaultRouteBreadcrumbs entries={entries} />
  }

  if (isVaultDocumentRoute && vaultId) {
    const entries = [
      ...buildVaultBreadcrumbs({
        vaultId,
        vaultName,
        breadcrumbs: folderBreadcrumbs,
      }),
      {
        key: `document-${documentId ?? "current"}`,
        label: documentName ?? "Document",
      },
    ]

    return <VaultRouteBreadcrumbs entries={entries} />
  }

  return (
    <DefaultBreadcrumbs
      breadcrumbs={buildRouteBreadcrumbs({
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

          return (
            <React.Fragment key={`${item.to ?? item.label}-${item.label}`}>
              {index > 0 ? <BreadcrumbSeparator className="text-muted-foreground" /> : null}
              <BreadcrumbItem className={cn("min-w-0", isLast ? "shrink" : "shrink-0")}>
                {item.to && !isLast ? (
                  <BreadcrumbLink asChild>
                    <Link to={item.to} className="min-w-0 font-medium text-inherit">
                      <span title={item.label} className="block truncate">
                        {item.label}
                      </span>
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage title={item.label} className="truncate">
                    {item.label}
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

          return (
            <React.Fragment key={entry.key}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className={cn("min-w-0", isLast ? "shrink" : "shrink-0")}>
                {entry.to && !isLast ? (
                  <BreadcrumbLink asChild>
                    <Link to={entry.to} className="min-w-0 font-medium text-inherit">
                      <span title={entry.label} className="block truncate">
                        {entry.label}
                      </span>
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage title={entry.label} className="min-w-0 truncate">
                    <span className="block truncate">{entry.label}</span>
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
