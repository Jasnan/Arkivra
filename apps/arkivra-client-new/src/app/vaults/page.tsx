"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, ArrowRight, FileText, HardDrive, ShieldCheck } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useHeaderActions } from "@/contexts/header-actions-context"
import { cn } from "@/lib/utils"
import { CreateVaultDialog } from "./components/create-vault-dialog"
import { VaultsViewToggle } from "./components/vaults-view-toggle"
import { getMe, listVaults, type VaultSummary } from "./vaults.api"
import { useVaultsView } from "./use-vaults-view"

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  const formatted = amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1)

  return `${formatted} ${units[exponent]}`
}

function formatVaultDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Unknown"
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function getVaultDescription(value: string | null) {
  if (!value) {
    return null
  }

  if (value === "Credise default vault") {
    return "Default vault"
  }

  return value
}

function getDescriptionPreview(value: string | null) {
  if (!value) {
    return null
  }

  if (value.length <= 120) {
    return value
  }

  return `${value.slice(0, 117).trimEnd()}...`
}

function getParticipationLabel(vault: VaultSummary) {
  if (vault.role === "owner") return "Owner"
  if (vault.role === "editor") return "Editor"
  if (vault.role === "viewer") return "Viewer"
  return "No participation"
}

function getParticipationBadgeClass(vault: VaultSummary) {
  if (vault.role === null) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  }

  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
}

function VaultGrid({ vaults, onOpenVault }: {
  vaults: VaultSummary[]
  onOpenVault: (vault: VaultSummary) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {vaults.map((vault) => {
        const description = getDescriptionPreview(getVaultDescription(vault.description))

        return (
          <Card
            key={vault.id}
            role="link"
            tabIndex={0}
            className="group cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            onClick={() => onOpenVault(vault)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onOpenVault(vault)
              }
            }}
          >
            <CardContent className="flex min-h-40 flex-col items-center justify-center p-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <Archive className="size-7" strokeWidth={1.7} />
              </div>
              <h2 className="mt-3 max-w-full truncate text-sm font-semibold">
                {vault.name}
              </h2>
              <p
                className={cn(
                  "mt-1 min-h-5 max-w-full truncate text-xs text-muted-foreground",
                  !description && "invisible"
                )}
              >
                {description ?? "Description"}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {vault.fileCount} {vault.fileCount === 1 ? "file" : "files"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <HardDrive className="size-3.5" />
                  {formatBytes(vault.totalSize)}
                </span>
              </div>
              <Badge variant="outline" className={cn("mt-2", getParticipationBadgeClass(vault))}>
                {getParticipationLabel(vault)}
              </Badge>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function VaultList({ vaults, onOpenVault }: {
  vaults: VaultSummary[]
  onOpenVault: (vault: VaultSummary) => void
}) {
  return (
    <div className="overflow-hidden border-y bg-background">
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_4rem_5.75rem_7.5rem] gap-3 border-b bg-muted/40 px-4 py-3 text-sm font-medium text-muted-foreground md:grid lg:px-6">
        <span>Name</span>
        <span>Access</span>
        <span>Files</span>
        <span>Size</span>
        <span>Modified</span>
      </div>
      <div>
        {vaults.map((vault) => (
          <div
            key={vault.id}
            role="link"
            tabIndex={0}
            className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-4 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_7rem_4rem_5.75rem_7.5rem] lg:px-6"
            onClick={() => onOpenVault(vault)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onOpenVault(vault)
              }
            }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <Archive className="size-6" strokeWidth={1.7} />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{vault.name}</div>
                <div className="mt-1 truncate text-sm text-muted-foreground md:hidden">
                  {getParticipationLabel(vault)} · {vault.fileCount} {vault.fileCount === 1 ? "file" : "files"} · {formatBytes(vault.totalSize)}
                </div>
              </div>
            </div>

            <Badge
              variant="outline"
              className={cn("hidden md:inline-flex", getParticipationBadgeClass(vault))}
            >
              {getParticipationLabel(vault)}
            </Badge>
            <span className="hidden truncate text-sm text-muted-foreground md:block">
              {vault.fileCount}
            </span>
            <span className="hidden truncate text-sm text-muted-foreground md:block">
              {formatBytes(vault.totalSize)}
            </span>
            <span className="hidden truncate text-sm text-muted-foreground md:block">
              {formatVaultDate(vault.updatedAt ?? vault.createdAt)}
            </span>
            <ArrowRight className="size-4 text-muted-foreground md:hidden" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function VaultsPage() {
  const navigate = useNavigate()
  const [view] = useVaultsView()
  const [vaults, setVaults] = useState<VaultSummary[]>([])
  const [canCreateVault, setCanCreateVault] = useState(true)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const sortedVaults = useMemo(
    () => [...vaults].sort((a, b) => a.name.localeCompare(b.name)),
    [vaults]
  )
  const headerActions = useMemo(
    () => (
      <>
        <VaultsViewToggle />
        <CreateVaultDialog />
      </>
    ),
    []
  )

  useHeaderActions(headerActions)

  const loadVaults = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)

    const [vaultsResult, meResult] = await Promise.allSettled([
      listVaults(),
      getMe(),
    ])

    if (vaultsResult.status === "fulfilled") {
      setVaults(vaultsResult.value.vaults)
    } else {
      setErrorMessage(
        vaultsResult.reason instanceof Error
          ? vaultsResult.reason.message
          : "Unable to load vaults."
      )
    }

    if (meResult.status === "fulfilled") {
      setCanCreateVault(meResult.value.canCreateVault)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadVaults()
  }, [loadVaults])

  useEffect(() => {
    function handleVaultCreated() {
      void loadVaults()
    }

    window.addEventListener("arkivra:vault-created", handleVaultCreated)

    return () => {
      window.removeEventListener("arkivra:vault-created", handleVaultCreated)
    }
  }, [loadVaults])

  function openVault(vault: VaultSummary) {
    navigate(`/vaults/${vault.id}`)
  }

  return (
    <BaseLayout>
      {loading ? (
        <div className="px-4 lg:px-6">
          <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
            Loading vaults...
          </div>
        </div>
      ) : errorMessage ? (
        <div className="px-4 lg:px-6">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        </div>
      ) : sortedVaults.length === 0 ? (
        <div className="px-4 lg:px-6">
          <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border bg-muted/20 p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <ShieldCheck className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">No vaults yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {canCreateVault
                ? "Create your first vault to start storing documents."
                : "No vaults available yet. Request a vault and an admin can approve it."}
            </p>
          </div>
        </div>
      ) : view === "grid" ? (
        <div className="px-4 lg:px-6">
          <VaultGrid vaults={sortedVaults} onOpenVault={openVault} />
        </div>
      ) : (
        <VaultList vaults={sortedVaults} onOpenVault={openVault} />
      )}
    </BaseLayout>
  )
}
