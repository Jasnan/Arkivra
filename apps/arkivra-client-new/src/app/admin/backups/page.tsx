"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileArchive,
  FileJson,
  HardDrive,
  Loader2,
  PackageOpen,
  RefreshCw,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { getMe } from "../ai-settings/ai-settings.api"
import {
  createBackup,
  getBackupDownloadUrl,
  getBackupPartDownloadUrl,
  importBackupManifest,
  listBackups,
  restoreBackup,
  uploadBackupPart,
  type BackupArchiveManifest,
  type BackupListItem,
} from "./backups.api"

interface AsyncState<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
}

const emptyMeState: AsyncState<{ isAdmin: boolean }> = {
  data: null,
  isLoading: true,
  error: null,
}

const emptyBackupsState: AsyncState<{ backups: BackupListItem[] }> = {
  data: null,
  isLoading: true,
  error: null,
}

const MANIFEST_FILE_SUFFIX_RE = /\.manifest\.json$/

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  const formatted = amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1)

  return `${formatted} ${units[exponent]}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function backupKindLabel(backup: BackupListItem) {
  return backup.format === "encrypted_multipart" ? "Encrypted multipart" : "Legacy archive"
}

function backupBaseName(backup: BackupListItem) {
  return backup.id.replace(MANIFEST_FILE_SUFFIX_RE, "")
}

function getPartFileName(backup: BackupListItem, index: number) {
  return `${backupBaseName(backup)}.part${String(index + 1).padStart(3, "0")}`
}

function parseManifest(value: string) {
  const parsed = JSON.parse(value) as BackupArchiveManifest

  if (!parsed || typeof parsed !== "object" || !parsed.archive || !Array.isArray(parsed.archive.parts)) {
    throw new Error("The selected manifest is not a valid Arkivra backup manifest.")
  }

  return parsed
}

function BackupStatusBadge({ backup }: { backup: BackupListItem }) {
  if (backup.restorable) {
    return (
      <Badge variant="outline" className="border-primary/20 bg-primary/10 text-foreground">
        <CheckCircle2 className="size-3" />
        Restorable
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
      <AlertTriangle className="size-3" />
      Incomplete
    </Badge>
  )
}

function BackupDownloads({ backup }: { backup: BackupListItem }) {
  if (backup.format !== "encrypted_multipart") {
    return (
      <Button asChild type="button" size="sm" variant="outline">
        <a href={getBackupDownloadUrl({ backupId: backup.id })}>
          <Download className="size-4" />
          Download
        </a>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Download className="size-4" />
          Download files
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Backup set files</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={getBackupDownloadUrl({ backupId: backup.id })}>
            <FileJson className="size-4" />
            Download manifest
          </a>
        </DropdownMenuItem>
        {Array.from({ length: backup.partCount }, (_, index) => {
          const partFileName = getPartFileName(backup, index)
          return (
            <DropdownMenuItem key={partFileName} asChild>
              <a href={getBackupPartDownloadUrl({ backupId: backup.id, partFileName })}>
                <PackageOpen className="size-4" />
                Download part {index + 1}
              </a>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BackupList({
  backups,
  restorePending,
  onRestore,
}: {
  backups: BackupListItem[]
  restorePending: boolean
  onRestore: (backup: BackupListItem) => void
}) {
  return (
    <div className="-mx-4 overflow-hidden border-y bg-background lg:-mx-6">
      <div className="hidden grid-cols-[minmax(0,1fr)_9rem_7rem_7rem_11rem_17rem] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid lg:px-6">
        <span>Archive</span>
        <span>Status</span>
        <span>Size</span>
        <span>Parts</span>
        <span>Created</span>
        <span className="text-right">Actions</span>
      </div>
      <div>
        {backups.map((backup) => (
          <div
            key={backup.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-accent/30 md:grid-cols-[minmax(0,1fr)_9rem_7rem_7rem_11rem_17rem] lg:px-6"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <FileArchive className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{backup.fileName}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
                  {backupKindLabel(backup)} · {formatBytes(backup.size)} · {formatDate(backup.createdAt)}
                </div>
                {backup.corruptReason ? (
                  <div className="mt-1 truncate text-xs text-destructive">{backup.corruptReason}</div>
                ) : null}
              </div>
            </div>
            <div className="hidden md:block">
              <BackupStatusBadge backup={backup} />
            </div>
            <span className="hidden text-sm text-muted-foreground md:block">{formatBytes(backup.size)}</span>
            <span className="hidden text-sm text-muted-foreground md:block">
              {backup.format === "encrypted_multipart" ? backup.partCount : "Legacy"}
            </span>
            <span className="hidden text-sm text-muted-foreground md:block">{formatDate(backup.createdAt)}</span>
            <div className="flex items-center justify-end gap-2">
              <div className="hidden md:block">
                <BackupDownloads backup={backup} />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={restorePending || !backup.restorable}
                title={backup.restorable ? undefined : "Backup set is incomplete or invalid"}
                onClick={() => onRestore(backup)}
              >
                <ArchiveRestore className="size-4" />
                Restore
              </Button>
            </div>
            <div className="col-span-2 flex flex-wrap justify-start gap-2 md:hidden">
              <BackupStatusBadge backup={backup} />
              <BackupDownloads backup={backup} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminBackupsPage() {
  const [meState, setMeState] = useState<AsyncState<{ isAdmin: boolean }>>(emptyMeState)
  const [backupsState, setBackupsState] = useState<AsyncState<{ backups: BackupListItem[] }>>(emptyBackupsState)
  const [createPending, setCreatePending] = useState(false)
  const [restorePending, setRestorePending] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupListItem | null>(null)
  const [restoreConfirmed, setRestoreConfirmed] = useState(false)
  const [importFiles, setImportFiles] = useState<File[]>([])
  const [importInputKey, setImportInputKey] = useState(0)
  const [importPending, setImportPending] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const backups = useMemo(() => backupsState.data?.backups ?? [], [backupsState.data?.backups])
  const isAdmin = meState.data?.isAdmin === true
  const latestBackup = backups[0]
  const restorableCount = backups.filter((backup) => backup.restorable).length
  const totalArchiveSize = backups.reduce((total, backup) => total + backup.size, 0)

  const loadMe = useCallback(async () => {
    setMeState({ data: null, isLoading: true, error: null })

    try {
      const me = await getMe()
      setMeState({ data: { isAdmin: me.isAdmin }, isLoading: false, error: null })
    } catch (error) {
      setMeState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Unable to load account."),
      })
    }
  }, [])

  const loadBackups = useCallback(async () => {
    setBackupsState((current) => ({ data: current.data, isLoading: true, error: null }))

    try {
      const result = await listBackups()
      setBackupsState({ data: result, isLoading: false, error: null })
    } catch (error) {
      setBackupsState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Unable to load backups."),
      })
    }
  }, [])

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  useEffect(() => {
    if (isAdmin) {
      void loadBackups()
    }
  }, [isAdmin, loadBackups])

  async function handleCreateBackup() {
    if (createPending) return

    setCreatePending(true)
    try {
      const result = await createBackup()
      toast.success(`Backup queued as job ${result.jobId}.`)
      await loadBackups()
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not queue backup."))
    } finally {
      setCreatePending(false)
    }
  }

  async function handleRestoreBackup() {
    if (restoreTarget === null || !restoreConfirmed || restorePending) return

    setRestorePending(true)
    try {
      const result = await restoreBackup({ backupId: restoreTarget.id })
      toast.success(`Restore queued as job ${result.jobId}.`)
      setRestoreTarget(null)
      setRestoreConfirmed(false)
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not queue restore."))
    } finally {
      setRestorePending(false)
    }
  }

  async function handleImportBackup() {
    if (importFiles.length === 0 || importPending) return

    setImportPending(true)
    setImportProgress(0)

    try {
      setImportStatus("Validating backup manifest...")
      const manifestFile = importFiles.find((file) => file.name.endsWith(".manifest.json"))

      if (!manifestFile) {
        throw new Error("Select a backup manifest file.")
      }

      const manifest = parseManifest(await manifestFile.text())
      const parts = [...manifest.archive.parts].sort((left, right) => left.index - right.index)

      if (parts.length === 0) {
        throw new Error("The selected manifest does not list any backup parts.")
      }

      const selectedFilesByName = new Map(importFiles.map((file) => [file.name, file]))
      const missingPart = parts.find((part) => !selectedFilesByName.has(part.fileName))
      if (missingPart) {
        throw new Error(`Missing backup part ${missingPart.fileName}.`)
      }

      setImportStatus("Importing backup manifest...")
      const imported = await importBackupManifest({ manifest })
      setImportProgress(10)

      for (const [index, part] of parts.entries()) {
        setImportStatus(`Uploading part ${index + 1} of ${parts.length}...`)
        await uploadBackupPart({
          backupId: imported.backupId,
          file: selectedFilesByName.get(part.fileName)!,
        })
        setImportProgress(10 + Math.round(((index + 1) / parts.length) * 85))
      }

      setImportStatus("Refreshing backup list...")
      await loadBackups()
      toast.success(`Backup imported as ${imported.backupId}.`)
      setImportFiles([])
      setImportInputKey((key) => key + 1)
      setImportStatus(null)
      setImportProgress(0)
    } catch (error) {
      setImportStatus(null)
      setImportProgress(0)
      toast.error(getErrorMessage(error, "Could not import backup."))
    } finally {
      setImportPending(false)
    }
  }

  if (meState.isLoading) {
    return (
      <BaseLayout title="Backups" description="Create, import, download, and restore backup archives.">
        <div className="px-4 lg:px-6">
          <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading account...</div>
        </div>
      </BaseLayout>
    )
  }

  if (meState.error) {
    return (
      <BaseLayout title="Backups" description="Create, import, download, and restore backup archives.">
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Could not load account</CardTitle>
              <CardDescription>{meState.error.message}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </BaseLayout>
    )
  }

  if (!isAdmin) {
    return (
      <BaseLayout title="Backups" description="Create, import, download, and restore backup archives.">
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform administrator required</CardTitle>
              <CardDescription>Only platform administrators can manage backups and restores.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </BaseLayout>
    )
  }

  return (
    <BaseLayout title="Backups" description="Create, import, download, and restore backup archives.">
      <div className="space-y-6 px-4 lg:px-6">
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Available archives</CardDescription>
              <CardTitle className="text-2xl">{backups.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Restorable sets</CardDescription>
              <CardTitle className="text-2xl">{restorableCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total size</CardDescription>
              <CardTitle className="text-2xl">{formatBytes(totalArchiveSize)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Create backup</CardTitle>
                <CardDescription>
                  Queue a new archive of the database and stored document assets.
                </CardDescription>
              </div>
              <Button type="button" disabled={createPending} onClick={() => void handleCreateBackup()}>
                {createPending ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
                {createPending ? "Queueing..." : "Create backup"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
                Restoring a backup replaces users, sessions, settings, vaults, documents, chats, audit records,
                jobs, and storage files with the selected archive.
              </div>
              {latestBackup ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Latest archive: <span className="font-medium text-foreground">{latestBackup.fileName}</span>, created {formatDate(latestBackup.createdAt)}.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Import backup set</CardTitle>
              <CardDescription>Select one manifest and every encrypted part from the same backup set.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={importInputRef}
                key={importInputKey}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => setImportFiles(Array.from(event.currentTarget.files ?? []))}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => importInputRef.current?.click()}>
                  <Upload className="size-4" />
                  Select files
                </Button>
                <Button
                  type="button"
                  disabled={importPending || importFiles.length === 0}
                  onClick={() => void handleImportBackup()}
                >
                  {importPending ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
                  {importPending ? "Importing..." : "Import"}
                </Button>
                {importFiles.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Clear selected import files"
                    disabled={importPending}
                    onClick={() => {
                      setImportFiles([])
                      setImportInputKey((key) => key + 1)
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground">
                {importFiles.length === 0
                  ? "No files selected."
                  : `${importFiles.length} file${importFiles.length === 1 ? "" : "s"} selected.`}
              </div>
              {importStatus ? (
                <div className="space-y-2" role="status">
                  <div className="text-sm text-muted-foreground">{importStatus}</div>
                  <Progress value={importProgress} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Backup archives</h2>
              <p className="text-sm text-muted-foreground">Download archives or queue a destructive restore.</p>
            </div>
            <Button type="button" variant="outline" size="icon" aria-label="Refresh backups" disabled={backupsState.isLoading} onClick={() => void loadBackups()}>
              <RefreshCw className={backupsState.isLoading ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>

          {backupsState.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {backupsState.error.message}
            </div>
          ) : backupsState.isLoading ? (
            <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
              Loading backups...
            </div>
          ) : backups.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center py-8 text-center">
              <HardDrive className="size-10 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-semibold">No backups available</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Create a backup or import an encrypted backup set to make it available for download or restore.
              </p>
            </div>
          ) : (
            <BackupList
              backups={backups}
              restorePending={restorePending}
              onRestore={(backup) => {
                setRestoreTarget(backup)
                setRestoreConfirmed(false)
              }}
            />
          )}
        </div>
      </div>

      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open && !restorePending) {
            setRestoreTarget(null)
            setRestoreConfirmed(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore backup</DialogTitle>
            <DialogDescription>
              Confirm restore for {restoreTarget?.fileName ?? "the selected backup"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Restoring this backup wipes this instance and replaces users, sessions, settings, vaults,
              documents, chats, audit records, jobs, and storage files.
            </div>
            {restoreTarget ? (
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="font-medium">{restoreTarget.fileName}</div>
                <div className="mt-1 text-muted-foreground">
                  Created {formatDate(restoreTarget.createdAt)} · {formatBytes(restoreTarget.size)} · {backupKindLabel(restoreTarget)}
                </div>
              </div>
            ) : null}
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                checked={restoreConfirmed}
                onCheckedChange={(checked) => setRestoreConfirmed(checked === true)}
              />
              <span>I understand this restore is destructive and replaces the current instance.</span>
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={restorePending}
              onClick={() => {
                setRestoreTarget(null)
                setRestoreConfirmed(false)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={restoreTarget === null || !restoreConfirmed || restorePending || !restoreTarget.restorable}
              onClick={() => void handleRestoreBackup()}
            >
              {restorePending ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
              {restorePending ? "Queueing..." : "Queue restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BaseLayout>
  )
}
