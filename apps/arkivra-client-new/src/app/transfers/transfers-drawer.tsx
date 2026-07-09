"use client"

import { useMemo } from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  File,
  FileImage,
  FileJson,
  FileText,
  FileType,
  LoaderCircle,
  Pause,
  Play,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { buildTransferSections, failureStatuses, type DisplayTransfer, type DisplayTransferStatus } from "./transfers-display"
import { uploadManager } from "./upload-manager"
import { useUploadManagerState } from "./use-upload-manager"

function statusLabel(status: DisplayTransferStatus) {
  switch (status) {
    case "queued":
      return "Queued"
    case "uploading":
      return "Uploading"
    case "paused":
      return "Paused"
    case "completed":
      return "Success"
    case "failed":
      return "Failed"
    case "canceled":
      return "Canceled"
    default:
      return status
  }
}

function conflictStrategyLabel(strategy: string) {
  switch (strategy) {
    case "skip":
      return "Skip"
    case "keep_both":
      return "Keep both"
    case "new_version":
      return "New version"
    default:
      return strategy
  }
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  const formatted = amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1)

  return `${formatted} ${units[exponent]}`
}

function isClearableStatus(status: DisplayTransferStatus) {
  return status === "completed" || status === "failed" || status === "canceled" || status === "paused"
}

function getTransferIconMeta(item: DisplayTransfer): { icon: LucideIcon; className: string } {
  const extension = item.name.split(".").pop()?.trim().toLocaleLowerCase()
  const mimeType = item.mimeType ?? ""

  if (mimeType.startsWith("image/") || ["gif", "jpeg", "jpg", "png", "webp"].includes(extension ?? "")) {
    return { icon: FileImage, className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" }
  }

  if (mimeType === "application/pdf" || extension === "pdf") {
    return { icon: FileText, className: "bg-rose-500/10 text-rose-700 dark:text-rose-300" }
  }

  if (
    extension === "doc" ||
    extension === "docx" ||
    extension === "odt" ||
    mimeType.includes("word") ||
    mimeType.includes("opendocument.text") ||
    mimeType.includes("officedocument.wordprocessingml")
  ) {
    return { icon: FileType, className: "bg-violet-500/10 text-violet-700 dark:text-violet-300" }
  }

  if (
    extension === "xls" ||
    extension === "xlsx" ||
    extension === "ods" ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet")
  ) {
    return { icon: FileType, className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" }
  }

  if (
    extension === "ppt" ||
    extension === "pptx" ||
    extension === "odp" ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("presentation")
  ) {
    return { icon: FileType, className: "bg-orange-500/10 text-orange-700 dark:text-orange-300" }
  }

  if (mimeType === "application/json" || extension === "json") {
    return { icon: FileJson, className: "bg-sky-500/10 text-sky-700 dark:text-sky-300" }
  }

  if (mimeType.startsWith("text/") || ["csv", "md", "rtf", "txt"].includes(extension ?? "")) {
    return { icon: FileText, className: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" }
  }

  return { icon: File, className: "bg-muted text-muted-foreground" }
}

function TransferRow({ item }: { item: DisplayTransfer }) {
  const { className, icon: Icon } = getTransferIconMeta(item)
  const isFailure = failureStatuses.has(item.status)
  const isSuccess = item.status === "completed"

  return (
    <div className="border-b py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", className)}>
          <Icon className="size-5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="truncate text-sm font-medium">{item.name}</p>
            <div
              className={cn(
                "flex shrink-0 items-center gap-1.5 text-xs font-medium",
                isFailure ? "text-destructive" : isSuccess ? "text-primary" : "text-muted-foreground"
              )}
            >
              {item.status === "uploading" ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : isSuccess ? (
                <CheckCircle2 className="size-3.5" />
              ) : isFailure ? (
                <AlertCircle className="size-3.5" />
              ) : null}
              <span>{statusLabel(item.status)}</span>
            </div>
          </div>
          {item.detail ? <p className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</p> : null}
          <Progress value={item.progress} className={cn("mt-3 h-1.5", isFailure && "[&_[data-slot=progress-indicator]]:bg-destructive")} />
          <div className="mt-1.5 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{formatBytes(item.bytesUploaded)} uploaded</span>
            <span>{formatBytes(item.size)}</span>
          </div>
          {item.error ? <p className="mt-2 text-xs text-destructive">{item.error}</p> : null}
          {item.conflict ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.conflict.availableStrategies.map((strategy) => (
                <Button
                  key={strategy}
                  type="button"
                  size="sm"
                  variant={strategy === "new_version" ? "default" : "outline"}
                  onClick={() => {
                    void uploadManager.resolveConflict(item.key, strategy)
                  }}
                >
                  {conflictStrategyLabel(strategy)}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TransferSection({ title, items }: { title: string; items: DisplayTransfer[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{title}</h3>
      <div>{items.map((item) => <TransferRow key={item.key} item={item} />)}</div>
    </section>
  )
}

export function TransfersDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const state = useUploadManagerState()
  const sections = useMemo(() => buildTransferSections(state.items), [state.items])
  const hasRows = sections.inProgress.length + sections.success.length + sections.failure.length > 0
  const hasClearableRows = state.items.some((item) => isClearableStatus(item.status))
  const hasActiveRows = state.activeCount + state.queuedCount > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex min-w-0 items-center justify-between gap-3 pr-8">
            <div className="min-w-0">
              <SheetTitle>Transfers</SheetTitle>
              <SheetDescription>Monitor uploads for this browser tab.</SheetDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasActiveRows ? (
                <Button type="button" size="sm" variant="outline" onClick={() => uploadManager.pauseAll()}>
                  <Pause className="size-4" />
                  Pause
                </Button>
              ) : state.items.some((item) => item.status === "paused") ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void uploadManager.resumeAll()}>
                  <Play className="size-4" />
                  Resume
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="outline" disabled={!hasClearableRows} onClick={() => uploadManager.clearSettled()}>
                <Trash2 className="size-4" />
                Clear
              </Button>
            </div>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 py-5">
            {hasRows ? (
              <div className="space-y-6">
                <TransferSection title="In progress" items={sections.inProgress} />
                <TransferSection title="Success" items={sections.success} />
                <TransferSection title="Failure" items={sections.failure} />
              </div>
            ) : (
              <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-md border p-8 text-center">
                <ArrowDownUp className="size-8 text-muted-foreground" />
                <h2 className="mt-4 text-lg font-semibold">No transfers yet</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">Uploads will appear here while they are queued, running, or recently completed.</p>
              </div>
            )}
          </div>
        </ScrollArea>
        {state.failedCount > 0 ? (
          <div className="border-t px-6 py-3">
            <Badge variant="destructive">{state.failedCount} failed</Badge>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
