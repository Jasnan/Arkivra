"use client"

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react"
import {
  AlertCircle,
  Blocks,
  CalendarDays,
  ClipboardCopy,
  Download,
  FileText,
  Hash,
  Image as ImageIcon,
  Info,
  Loader2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  ScanText,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateTime } from "@/lib/date-format"
import { cn } from "@/lib/utils"
import { useOptionalVaultRouteShell } from "@/app/vaults/vault-route-shell"
import { DEFAULT_TAG_COLOR, TagFormDialog } from "../tags/components/tag-form-dialog"
import {
  assignTagToDocument,
  createTag,
  listDocumentTags,
  listTags,
  removeTagFromDocument,
  type Tag,
} from "../tags/tags.api"
import { DocumentTagsCell } from "./components/document-tags-cell"
import { ImagePreviewFrame as ZoomableImagePreviewFrame } from "./components/image-preview-frame"
import { PdfPreviewFrame } from "./components/pdf-preview-frame"
import { VaultContextMenu, type VaultContextMenuState } from "./components/vault-context-menu"
import { VAULT_TREE_ROOT_VALUE, VaultSidebarTree } from "./components/vault-sidebar-tree"
import { useVaultTreeVisibility } from "./use-vault-tree-visibility"
import {
  deleteDocumentVersion,
  getMe,
  getDocument,
  getDocumentDownloadUrl,
  getDocumentInlineFileUrl,
  getDocumentVersion,
  getDocumentVersionDeletionImpact,
  getDocumentVersionDownloadUrl,
  getVault,
  getDocumentDuplicateConflict,
  listDeletedDocuments,
  listDocumentChunks,
  listDocumentVersionChunks,
  listDocumentVersions,
  listFolderTree,
  renameDocument,
  restoreDocument,
  softDeleteDocument,
  restoreDocumentVersion,
  updateDocumentLanguage,
  type DeletionImpactPreview,
  type DocumentChunkSummary,
  type DocumentDetail,
  type DocumentDuplicateConflict,
  type DocumentLanguageMetadata,
  type DocumentSummary,
  type DocumentVersionDetail,
  type DocumentVersionSummary,
  type FolderTreeDocumentEntry,
  type FolderTreeEntry,
  type UploadConflictStrategy,
  type VaultDetail,
} from "./vaults.api"

type PreviewKind = "pdf" | "image" | "text" | "pending" | "failed" | "unsupported"
type DocumentTab = "preview" | "content" | "metadata" | "versions"
type ContentTab = "text" | "chunks"

function DocumentContentTabs({
  value,
  onValueChange,
}: {
  value: ContentTab
  onValueChange: (value: ContentTab) => void
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === "text" || nextValue === "chunks") {
          onValueChange(nextValue)
        }
      }}
      className="shrink-0 gap-0"
    >
      <TabsList aria-label="Document content view" className="h-10 rounded-lg bg-muted/70 p-1">
        <TabsTrigger value="text" className="cursor-pointer gap-2 px-3">
          <FileText className="size-4" />
          Extracted text
        </TabsTrigger>
        <TabsTrigger value="chunks" className="cursor-pointer gap-2 px-3">
          <Blocks className="size-4" />
          Chunks
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

const imagePreviewExtensions = new Set(["gif", "jpeg", "jpg", "png", "webp"])
const documentFileExtensionPattern = /\.[^/.]+$/
const editableDocumentLanguages = [
  { value: "unknown", label: "Unknown" },
  { value: "de", label: "German" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
] as const

function conflictStrategyLabel(strategy: UploadConflictStrategy) {
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

const formatDate = formatDateTime

function getVersionStatusLabel(version: DocumentVersionSummary) {
  if (version.deletedAt !== null) return "Deleted"
  return version.processingStatus ?? "pending"
}

function isVersionRestorable(version: DocumentVersionSummary) {
  return !version.isCurrent && version.deletedAt === null && version.processingStatus === "completed"
}

function isVersionDeletable(version: DocumentVersionSummary) {
  return !version.isCurrent && version.deletedAt === null
}

function isProcessingActive(status: DocumentSummary["processingStatus"]) {
  return (
    status === "pending" ||
    status === "queued" ||
    status === "partitioning" ||
    status === "chunking" ||
    status === "summarising" ||
    status === "processing"
  )
}

function canPrintPreview(previewKind: PreviewKind, selectedVersionId: string | null) {
  return selectedVersionId === null && (previewKind === "pdf" || previewKind === "image" || previewKind === "text")
}

function canUpdateVault(vault: { role?: string | null } | null | undefined) {
  return vault?.role === "owner" || vault?.role === "editor"
}

async function hydrateDocumentTags({
  vaultId,
  document,
}: {
  vaultId: string
  document: DocumentDetail
}) {
  const result = await listDocumentTags({ vaultId, documentId: document.id })
  return {
    ...document,
    tags: result.tags,
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function printDocumentPreview({
  documentName,
  inlineFileUrl,
  previewKind,
  onPrintWindowError,
}: {
  documentName: string
  inlineFileUrl: string
  previewKind: PreviewKind
  onPrintWindowError: () => void
}) {
  if (previewKind === "pdf" || previewKind === "text") {
    const frame = window.document.createElement("iframe")
    frame.style.position = "fixed"
    frame.style.right = "0"
    frame.style.bottom = "0"
    frame.style.width = "0"
    frame.style.height = "0"
    frame.style.border = "0"
    frame.src = inlineFileUrl
    frame.onload = () => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    }
    window.document.body.appendChild(frame)
    window.setTimeout(() => {
      frame.remove()
    }, 60_000)
    return
  }

  if (previewKind === "image") {
    const printWindow = window.open("", "_blank")

    if (printWindow === null) {
      onPrintWindowError()
      return
    }

    printWindow.opener = null

    const escapedDocumentName = escapeHtml(documentName)

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapedDocumentName}</title>
          <style>
            body {
              margin: 0;
              display: flex;
              min-height: 100vh;
              align-items: center;
              justify-content: center;
              background: white;
            }
            img {
              max-width: 100%;
              max-height: 100vh;
              object-fit: contain;
            }
          </style>
        </head>
        <body>
          <img id="arkivra-print-image" alt="${escapedDocumentName}" />
        </body>
      </html>
    `)
    printWindow.document.close()

    const printImage = printWindow.document.getElementById("arkivra-print-image") as HTMLImageElement | null

    if (printImage === null) {
      onPrintWindowError()
      printWindow.close()
      return
    }

    printImage.onload = () => {
      printWindow.focus()
      printWindow.print()
    }
    printImage.onerror = () => {
      onPrintWindowError()
      printWindow.close()
    }
    printImage.src = inlineFileUrl
  }
}

function getProcessingMessage(document: Pick<DocumentSummary, "processingStatus" | "processingErrorMessage">, content: string) {
  if (content.trim().length > 0) return content

  switch (document.processingStatus) {
    case "pending":
      return "This document is waiting to be processed."
    case "queued":
      return "This document is queued for ingestion and will start shortly."
    case "partitioning":
    case "processing":
      return "Arkivra is extracting the document's content so it can be searched, previewed, and used with AI."
    case "chunking":
      return "Arkivra is grouping extracted content into retrieval chunks."
    case "summarising":
      return "Arkivra is generating searchable summaries for multimodal chunks."
    case "failed":
      return document.processingErrorMessage?.trim()
        ? `Document processing failed: ${document.processingErrorMessage.trim()}`
        : "Document processing failed for this file."
    case "completed":
      return "Processing completed, but no extracted text was found."
    default:
      return "No extracted text is available yet."
  }
}

function getFileExtension(name: string) {
  const extension = name.split(".").pop()?.trim().toLowerCase()
  return extension && extension !== name.trim().toLowerCase() ? extension : ""
}

function getDocumentTitle(name: string) {
  return name.replace(documentFileExtensionPattern, "")
}

function getDocumentLanguageLabel(language: DocumentLanguageMetadata | null | undefined) {
  if (!language) return "Unknown"
  return language.name || language.code.toUpperCase()
}

function getDocumentFileTypeLabel(mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase()

  if (normalizedMimeType === "application/pdf") return "PDF document"
  if (normalizedMimeType.startsWith("image/")) return "Image file"
  if (
    normalizedMimeType === "application/json" ||
    normalizedMimeType === "text/json" ||
    normalizedMimeType.endsWith("+json")
  ) {
    return "JSON document"
  }
  if (normalizedMimeType.startsWith("text/")) return "Text document"

  return "Document"
}

function getSemanticIndexLabel(document: DocumentDetail) {
  const semanticIndex = document.semanticIndex

  if (!semanticIndex) {
    return {
      detail: "No semantic index is available for this document.",
      label: "Not indexed",
      variant: "secondary" as const,
    }
  }

  const embedded = semanticIndex.embeddedChunkCount.toLocaleString()
  const expected = semanticIndex.expectedChunkCount.toLocaleString()

  if (semanticIndex.documentStatus === "ready") {
    return { detail: `${embedded} / ${expected} chunks indexed.`, label: "Indexed", variant: "default" as const }
  }
  if (semanticIndex.documentStatus === "indexing") {
    return { detail: `${embedded} / ${expected} chunks indexed.`, label: "Indexing", variant: "outline" as const }
  }
  if (semanticIndex.documentStatus === "pending") {
    return { detail: "Waiting for indexing.", label: "Pending", variant: "secondary" as const }
  }
  if (semanticIndex.documentStatus === "stale") {
    return { detail: "Document changed and is waiting for reindexing.", label: "Stale", variant: "outline" as const }
  }
  if (semanticIndex.documentStatus === "failed") {
    return { detail: "Indexing failed.", label: "Failed", variant: "destructive" as const }
  }
  if (semanticIndex.documentStatus === "skipped") {
    return { detail: "This document was skipped by semantic indexing.", label: "Skipped", variant: "secondary" as const }
  }

  return {
    detail: "No index record exists for the current document version.",
    label: "Not indexed",
    variant: "secondary" as const,
  }
}

function getPreviewKind({
  mimeType,
  name,
  originalName,
  hasPreviewPdf,
  derivedPreviewStatus,
}: {
  mimeType: string
  name: string
  originalName: string
  hasPreviewPdf?: boolean
  derivedPreviewStatus?: DocumentSummary["derivedPreviewStatus"]
}): PreviewKind {
  if (hasPreviewPdf || derivedPreviewStatus === "ready" || mimeType === "application/pdf") {
    return "pdf"
  }

  if (
    mimeType.toLowerCase().startsWith("image/") ||
    [name, originalName].some((value) => imagePreviewExtensions.has(getFileExtension(value)))
  ) {
    return "image"
  }

  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType.endsWith("+json") ||
    ["csv", "md", "markdown", "txt", "json", "xml", "html", "htm"].some((extension) =>
      [name, originalName].some((value) => getFileExtension(value) === extension)
    )
  ) {
    return "text"
  }

  if (derivedPreviewStatus === "pending") return "pending"
  if (derivedPreviewStatus === "failed") return "failed"

  return "unsupported"
}

function getActiveDocument({
  document,
  version,
}: {
  document: DocumentDetail
  version: DocumentVersionDetail | null
}) {
  if (!version) return document

  return {
    ...document,
    originalName: version.originalName,
    originalSize: version.originalSize,
    originalSha256Hash: version.originalSha256Hash,
    mimeType: version.mimeType,
    language: version.language,
    processingStatus: version.processingStatus,
    processingErrorMessage: version.processingErrorMessage,
    hasPreviewPdf: version.hasPreviewPdf,
    derivedPreviewStatus: version.derivedPreviewStatus,
    content: version.rawMarkdown || version.rawText || version.content,
    displayContent: version.rawMarkdown || version.rawText || version.content,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  } satisfies DocumentDetail
}

function MetadataItem({
  icon: Icon,
  label,
  value,
  children,
  action,
  className,
  copyValue,
  copyLabel,
  onCopy,
}: {
  icon: typeof Info
  label: string
  value?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
  copyValue?: string
  copyLabel?: string
  onCopy?: (value: string, label: string) => void
}) {
  const copyAction = copyValue && copyLabel && onCopy ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      aria-label={`Copy ${copyLabel.toLowerCase()}`}
      onClick={() => onCopy(copyValue, copyLabel)}
    >
      <ClipboardCopy className="size-4" />
    </Button>
  ) : null

  return (
    <div className={cn("flex min-w-0 items-start gap-3", className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-sm font-medium">
          <div className="min-w-0">
            {children ?? <span className="break-words">{value}</span>}
          </div>
          {action ?? copyAction}
        </div>
      </div>
    </div>
  )
}

function DocumentMetadataPanel({
  document,
  currentName,
  currentLanguage,
  isNameEditing,
  isLanguageEditing,
  isMetadataSaving,
  hasNameChanged,
  hasLanguageChanged,
  onNameChange,
  onLanguageChange,
  onEditName,
  onEditLanguage,
  editsDisabled = false,
  onCopyMetadataValue,
  onSubmit,
}: {
  document: DocumentDetail
  currentName: string
  currentLanguage: string
  isNameEditing: boolean
  isLanguageEditing: boolean
  isMetadataSaving: boolean
  hasNameChanged: boolean
  hasLanguageChanged: boolean
  onNameChange: (value: string) => void
  onLanguageChange: (value: string) => void
  onEditName: () => void
  onEditLanguage: () => void
  editsDisabled?: boolean
  onCopyMetadataValue: (value: string, label: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const semanticIndex = document.semanticIndex
  const semanticIndexLabel = getSemanticIndexLabel(document)

  return (
    <form className="flex min-h-full flex-col gap-4" onSubmit={onSubmit}>
      <section>
        <div className="flex flex-row items-center justify-between gap-4">
          <h2 className="text-base font-semibold">Document metadata</h2>
          {!editsDisabled && (isNameEditing || isLanguageEditing) ? (
            <Button
              type="submit"
              size="sm"
              disabled={isMetadataSaving || (!hasNameChanged && !hasLanguageChanged)}
            >
              {isMetadataSaving ? "Saving..." : "Save"}
            </Button>
          ) : null}
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <MetadataItem icon={FileText} label="Original filename" value={document.originalName} copyValue={document.originalName} copyLabel="Original filename" onCopy={onCopyMetadataValue} />

          <MetadataItem
            icon={Info}
            label="Source language"
            action={!editsDisabled ? (
              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Edit source language" onClick={onEditLanguage}>
                <Pencil className="size-4" />
              </Button>
            ) : null}
          >
            {!editsDisabled && isLanguageEditing ? (
              <Select value={currentLanguage} onValueChange={onLanguageChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source language" />
                </SelectTrigger>
                <SelectContent>
                  {editableDocumentLanguages.map((language) => (
                    <SelectItem key={language.value} value={language.value}>
                      {language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="block truncate">
                {getDocumentLanguageLabel(document.language)}
              </span>
            )}
          </MetadataItem>

          <MetadataItem
            icon={FileText}
            label="Display name"
            action={!editsDisabled ? (
              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Edit display name" onClick={onEditName}>
                <Pencil className="size-4" />
              </Button>
            ) : null}
          >
            {!editsDisabled && isNameEditing ? (
              <Input
                id="document-name"
                type="text"
                value={currentName}
                autoFocus
                onChange={(event) => onNameChange(event.target.value)}
              />
            ) : (
              <span className="block truncate">
                {document.name}
              </span>
            )}
          </MetadataItem>

          <MetadataItem icon={Download} label="File type and size" value={`${getDocumentFileTypeLabel(document.mimeType)} · ${formatBytes(document.originalSize)}`} />
          <MetadataItem icon={Info} label="MIME type" value={document.mimeType} />
          {semanticIndex ? (
            <>
              <MetadataItem
                icon={Hash}
                label="Chunks"
                value={`${semanticIndex.embeddedChunkCount.toLocaleString()} / ${semanticIndex.expectedChunkCount.toLocaleString()}`}
              />
              <MetadataItem icon={CalendarDays} label="Last indexed" value={semanticIndex.indexedAt ? formatDate(semanticIndex.indexedAt) : "Not indexed"} />
            </>
          ) : null}

          <MetadataItem icon={Info} label="Uploaded by" value={document.createdBy ?? "Unknown"} />
          <MetadataItem icon={CalendarDays} label="Uploaded at" value={formatDate(document.createdAt)} />
          <MetadataItem icon={CalendarDays} label="Last updated" value={formatDate(document.updatedAt)} />
          <MetadataItem icon={Search} label="Semantic index">
            <div className="flex flex-col gap-1.5">
              <Badge className="w-fit" variant={semanticIndexLabel.variant}>{semanticIndexLabel.label}</Badge>
              <span className="text-sm font-normal text-muted-foreground">{semanticIndexLabel.detail}</span>
            </div>
          </MetadataItem>
          <MetadataItem icon={Hash} label="Document ID" value={document.id} copyValue={document.id} copyLabel="Document ID" onCopy={onCopyMetadataValue} />
        </div>
      </section>
    </form>
  )
}

function DocumentRestoreConflictDialog({
  conflict,
  isPending,
  onClose,
  onResolve,
}: {
  conflict: DocumentDuplicateConflict | null
  isPending: boolean
  onClose: () => void
  onResolve: (strategy: UploadConflictStrategy) => void
}) {
  return (
    <Dialog
      open={conflict !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Document already exists</DialogTitle>
          <DialogDescription>
            {conflict?.message ?? "A document with this file already exists in this vault."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {conflict?.availableStrategies.map((strategy) => (
            <Button
              key={strategy}
              type="button"
              variant={strategy === "keep_both" ? "default" : "outline"}
              disabled={isPending}
              onClick={() => onResolve(strategy)}
            >
              {conflictStrategyLabel(strategy)}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImagePreviewFrame({
  src,
  documentName,
  downloadUrl,
}: {
  src: string
  documentName: string
  downloadUrl: string
}) {
  function printImage() {
    printDocumentPreview({
      documentName,
      inlineFileUrl: src,
      previewKind: "image",
      onPrintWindowError: () => toast.error("Could not open print dialog."),
    })
  }

  return (
    <ZoomableImagePreviewFrame
      src={src}
      alt={documentName}
      toolbarActions={
        <>
          <Button type="button" size="icon" variant="outline" aria-label="Print" onClick={printImage}>
            <Printer className="size-4" />
          </Button>
          <Button asChild size="icon" variant="outline">
            <a href={downloadUrl} aria-label="Download">
              <Download className="size-4" />
            </a>
          </Button>
        </>
      }
    />
  )
}

function PreviewPanel({
  previewKind,
  document,
  vaultId,
  documentId,
  inlineFileUrl,
  downloadUrl,
  selectedVersionId,
  aiFeaturesEnabled,
}: {
  previewKind: PreviewKind
  document: DocumentDetail
  vaultId: string
  documentId: string
  inlineFileUrl: string
  downloadUrl: string
  selectedVersionId: string | null
  aiFeaturesEnabled: boolean
}) {
  const extractedContent = document.displayContent ?? document.content

  if (selectedVersionId !== null && previewKind !== "text") {
    return (
      <EmptyPreview
        icon={<ImageIcon className="size-9" />}
        title="Historical preview is limited"
        description="This version can be reviewed through extracted text, chunks, metadata, or by downloading the original file."
        downloadUrl={downloadUrl}
      />
    )
  }

  if (previewKind === "pdf") {
    return (
      <PdfPreviewFrame
        src={inlineFileUrl}
        documentName={document.name}
        downloadUrl={downloadUrl}
        vaultId={vaultId}
        documentId={documentId}
        translationsDisabled={!aiFeaturesEnabled}
        sourceLanguage={document.language}
      />
    )
  }

  if (previewKind === "image") {
    return (
      <ImagePreviewFrame
        src={inlineFileUrl}
        documentName={document.name}
        downloadUrl={downloadUrl}
      />
    )
  }

  if (previewKind === "text") {
    return (
      <ScrollArea className="h-full min-h-0 bg-background">
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6 md:p-8">
          {extractedContent || "No text preview is available for this document."}
        </pre>
      </ScrollArea>
    )
  }

  if (previewKind === "pending") {
    return (
      <EmptyPreview
        icon={<Loader2 className="size-9 animate-spin" />}
        title="Preview is being prepared"
        description="Arkivra is preparing a browser preview for this document."
        downloadUrl={downloadUrl}
      />
    )
  }

  if (previewKind === "failed") {
    return (
      <EmptyPreview
        icon={<RefreshCw className="size-9" />}
        title="Preview generation failed"
        description="The source file is still available for download."
        downloadUrl={downloadUrl}
      />
    )
  }

  return (
    <EmptyPreview
      icon={<FileText className="size-9" />}
      title="Preview unavailable"
      description="This file type does not have a browser preview yet."
      downloadUrl={downloadUrl}
    />
  )
}

function EmptyPreview({
  icon,
  title,
  description,
  downloadUrl,
}: {
  icon: React.ReactNode
  title: string
  description: string
  downloadUrl: string
}) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center text-center">
      <div className="flex max-w-md flex-col items-center">
        <div className="flex size-16 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          {icon}
        </div>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Button asChild variant="outline" className="mt-5">
          <a href={downloadUrl}>
            <Download className="size-4" />
            Download
          </a>
        </Button>
      </div>
    </div>
  )
}

function ChunkList({
  chunks,
  loading,
  error,
}: {
  chunks: DocumentChunkSummary[]
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading chunks...
      </div>
    )
  }

  if (error) {
    return <div className="bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
  }

  if (chunks.length === 0) {
    return (
      <div className="flex min-h-80 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No chunks are available for this document.
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {chunks.map((chunk) => (
        <section key={chunk.id} className="py-4 first:pt-0 last:pb-0">
          <div className="pb-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Chunk {chunk.chunkIndex + 1}</Badge>
              {chunk.pageNumber ? <span>Page {chunk.pageNumber}</span> : null}
              {chunk.section ? <span>{chunk.section}</span> : null}
              {chunk.tokenCount ? <span>{chunk.tokenCount} tokens</span> : null}
            </div>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {chunk.originalText || chunk.content}
          </p>
        </section>
      ))}
    </div>
  )
}

export default function DocumentViewPage() {
  const params = useParams()
  const location = useLocation()
  const routeVaultId = params.vaultId ?? ""
  const documentId = params.documentId ?? ""
  const isTrashDocumentRoute = location.pathname.startsWith("/trash/")
  const navigate = useNavigate()
  const vaultRouteShell = useOptionalVaultRouteShell()
  const usesVaultRouteShell = vaultRouteShell !== null && !isTrashDocumentRoute
  const setShellHeaderConfig = vaultRouteShell?.setHeaderConfig
  const setShellSidebarConfig = vaultRouteShell?.setSidebarConfig
  const refreshVaultShell = vaultRouteShell?.refreshVaultShell
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get("tab")
  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [standaloneVault, setStandaloneVault] = useState<VaultDetail | null>(null)
  const [trashVaultId, setTrashVaultId] = useState("")
  const [standaloneFolders, setStandaloneFolders] = useState<FolderTreeEntry[]>([])
  const [standaloneTreeDocuments, setStandaloneTreeDocuments] = useState<FolderTreeDocumentEntry[]>([])
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersionDetail | null>(null)
  const [chunks, setChunks] = useState<DocumentChunkSummary[]>([])
  const [loadingDocument, setLoadingDocument] = useState(true)
  const [loadingVersion, setLoadingVersion] = useState(false)
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [chunksError, setChunksError] = useState<string | null>(null)
  const [tab, setTab] = useState<DocumentTab>(requestedTab === "versions" ? "versions" : "preview")
  const [contentTab, setContentTab] = useState<ContentTab>("text")
  const [vaultTreeExpandedValue, setVaultTreeExpandedValue] = useState<string[]>([
    VAULT_TREE_ROOT_VALUE,
  ])
  const [isStandaloneVaultTreeVisible, setIsStandaloneVaultTreeVisible] = useVaultTreeVisibility()
  const [renameValue, setRenameValue] = useState<string | null>(null)
  const [languageValue, setLanguageValue] = useState<string | null>(null)
  const [isNameEditing, setIsNameEditing] = useState(false)
  const [isLanguageEditing, setIsLanguageEditing] = useState(false)
  const [isMetadataSaving, setIsMetadataSaving] = useState(false)
  const [versionPendingRestore, setVersionPendingRestore] = useState<DocumentVersionSummary | null>(null)
  const [versionPendingDelete, setVersionPendingDelete] = useState<DocumentVersionSummary | null>(null)
  const [deleteImpact, setDeleteImpact] = useState<DeletionImpactPreview | null>(null)
  const [isDeleteImpactLoading, setIsDeleteImpactLoading] = useState(false)
  const [deleteImpactError, setDeleteImpactError] = useState<string | null>(null)
  const [isRestoreVersionPending, setIsRestoreVersionPending] = useState(false)
  const [isDeleteVersionPending, setIsDeleteVersionPending] = useState(false)
  const [isDeleteDocumentDialogOpen, setIsDeleteDocumentDialogOpen] = useState(false)
  const [isDeleteDocumentPending, setIsDeleteDocumentPending] = useState(false)
  const [isRestoreDocumentPending, setIsRestoreDocumentPending] = useState(false)
  const [restoreConflict, setRestoreConflict] = useState<DocumentDuplicateConflict | null>(null)
  const [createTagTargetDocumentId, setCreateTagTargetDocumentId] = useState<string | null>(null)
  const [createTagName, setCreateTagName] = useState("")
  const [createTagColor, setCreateTagColor] = useState(DEFAULT_TAG_COLOR)
  const [createTagDescription, setCreateTagDescription] = useState("")
  const [tagMutationPending, setTagMutationPending] = useState(false)
  const [vaultContextMenu, setVaultContextMenu] = useState<VaultContextMenuState | null>(null)
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(true)
  const vaultId = routeVaultId || trashVaultId
  const vault = usesVaultRouteShell ? vaultRouteShell.vault : standaloneVault
  const folders = usesVaultRouteShell ? vaultRouteShell.folders : standaloneFolders
  const treeDocuments = usesVaultRouteShell ? vaultRouteShell.treeDocuments : standaloneTreeDocuments
  const setEffectiveTreeDocuments = usesVaultRouteShell
    ? vaultRouteShell.setTreeDocuments
    : setStandaloneTreeDocuments
  const standaloneVaultTreeToggleLabel = isStandaloneVaultTreeVisible ? "Hide tree" : "Show tree"
  const isCreateTagDialogDirty =
    createTagName.trim().length > 0 ||
    createTagDescription.trim().length > 0 ||
    createTagColor !== DEFAULT_TAG_COLOR

  useEffect(() => {
    if (requestedTab === "versions" && !isTrashDocumentRoute) {
      setTab("versions")
    }
  }, [isTrashDocumentRoute, requestedTab])

  useEffect(() => {
    let ignore = false

    async function loadDocument() {
      setLoadingDocument(true)
      setErrorMessage(null)
      setRenameValue(null)
      setLanguageValue(null)
      setIsNameEditing(false)
      setIsLanguageEditing(false)

      try {
        let resolvedVaultId = routeVaultId

        if (isTrashDocumentRoute) {
          const deletedDocumentsResult = await listDeletedDocuments()
          const deletedDocument = deletedDocumentsResult.documents.find((item) => item.id === documentId)

          if (!deletedDocument) {
            throw new Error("Document not found in trash.")
          }

          resolvedVaultId = deletedDocument.vaultId
          if (!ignore) {
            setTrashVaultId(deletedDocument.vaultId)
          }
        }

        const [documentResult, versionsResult, shellResult] = await Promise.all([
          getDocument({ vaultId: resolvedVaultId, documentId }),
          isTrashDocumentRoute
            ? Promise.resolve({ versions: [] })
            : listDocumentVersions({ vaultId: resolvedVaultId, documentId }),
          usesVaultRouteShell
            ? Promise.resolve(null)
            : Promise.all([
                getVault({ vaultId: resolvedVaultId }),
                listFolderTree({ vaultId: resolvedVaultId }),
              ]),
        ])

        if (!ignore) {
          const hydratedDocument = isTrashDocumentRoute
            ? documentResult.document
            : await hydrateDocumentTags({ vaultId: resolvedVaultId, document: documentResult.document })

          if (ignore) return

          setDocument(hydratedDocument)
          if (shellResult !== null) {
            const [vaultResult, treeResult] = shellResult
            setStandaloneVault(vaultResult.vault)
            setStandaloneFolders(treeResult.folders)
            setStandaloneTreeDocuments(treeResult.documents)
          }
          setVersions(versionsResult.versions)
          setSelectedVersionId(null)
          setSelectedVersion(null)
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load document.")
        }
      } finally {
        if (!ignore) {
          setLoadingDocument(false)
        }
      }
    }

    if ((routeVaultId || isTrashDocumentRoute) && documentId) {
      void loadDocument()
    }

    return () => {
      ignore = true
    }
  }, [documentId, isTrashDocumentRoute, routeVaultId, usesVaultRouteShell])

  useEffect(() => {
    let ignore = false

    void getMe()
      .then((result) => {
        if (!ignore) {
          setAiFeaturesEnabled(result.aiFeaturesEnabled !== false && result.canUseAI !== false)
        }
      })
      .catch(() => {
        if (!ignore) {
          setAiFeaturesEnabled(true)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  const refreshTags = useCallback(async () => {
    const result = await listTags()
    setTags(result.tags)
  }, [])

  useEffect(() => {
    if (isTrashDocumentRoute || !documentId) return

    let ignore = false

    void listTags()
      .then((result) => {
        if (!ignore) {
          setTags(result.tags)
        }
      })
      .catch(() => {
        if (!ignore) {
          setTags([])
        }
      })

    return () => {
      ignore = true
    }
  }, [documentId, isTrashDocumentRoute])

  useEffect(() => {
    let ignore = false

    async function loadVersion() {
      if (selectedVersionId === null) {
        setSelectedVersion(null)
        return
      }

      setLoadingVersion(true)

      try {
        const result = await getDocumentVersion({ vaultId, documentId, versionId: selectedVersionId })

        if (!ignore) {
          setSelectedVersion(result.version)
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load document version.")
        }
      } finally {
        if (!ignore) {
          setLoadingVersion(false)
        }
      }
    }

    void loadVersion()

    return () => {
      ignore = true
    }
  }, [documentId, selectedVersionId, vaultId])

  useEffect(() => {
    let ignore = false

    async function loadChunks() {
      if (isTrashDocumentRoute || tab !== "content" || contentTab !== "chunks") return

      setLoadingChunks(true)
      setChunksError(null)

      try {
        const result =
          selectedVersionId === null
            ? await listDocumentChunks({ vaultId, documentId })
            : await listDocumentVersionChunks({ vaultId, documentId, versionId: selectedVersionId })

        if (!ignore) {
          setChunks(result.chunks)
        }
      } catch (error) {
        if (!ignore) {
          setChunksError(error instanceof Error ? error.message : "Unable to load chunks.")
        }
      } finally {
        if (!ignore) {
          setLoadingChunks(false)
        }
      }
    }

    void loadChunks()

    return () => {
      ignore = true
    }
  }, [contentTab, documentId, isTrashDocumentRoute, selectedVersionId, tab, vaultId])

  useEffect(() => {
    if (isTrashDocumentRoute && (tab === "content" || tab === "versions")) {
      setTab("preview")
    }
  }, [isTrashDocumentRoute, tab])

  const activeDocument = useMemo(() => {
    if (!document) return null
    return getActiveDocument({ document, version: selectedVersion })
  }, [document, selectedVersion])

  const previewKind = activeDocument
    ? getPreviewKind({
        mimeType: activeDocument.mimeType,
        name: activeDocument.name,
        originalName: activeDocument.originalName,
        hasPreviewPdf: selectedVersionId === null ? activeDocument.hasPreviewPdf : false,
        derivedPreviewStatus: selectedVersionId === null ? activeDocument.derivedPreviewStatus : undefined,
      })
    : "unsupported"
  const downloadUrl =
    selectedVersionId === null
      ? getDocumentDownloadUrl({ vaultId, documentId, includeDeleted: isTrashDocumentRoute })
      : getDocumentVersionDownloadUrl({ vaultId, documentId, versionId: selectedVersionId })
  const currentDownloadUrl = getDocumentDownloadUrl({ vaultId, documentId, includeDeleted: isTrashDocumentRoute })
  const inlineFileUrl = getDocumentInlineFileUrl({ vaultId, documentId, includeDeleted: isTrashDocumentRoute })
  const canPrint = !isTrashDocumentRoute && canPrintPreview(previewKind, selectedVersionId)
  const canEditDocumentTags =
    !isTrashDocumentRoute && selectedVersionId === null && canUpdateVault(vault)
  const extractedContent = activeDocument?.displayContent ?? activeDocument?.content ?? ""
  const extractedTextMessage = activeDocument
    ? getProcessingMessage(activeDocument, extractedContent)
    : "No extracted text is available yet."
  const vaultReturnPath = activeDocument?.folderId
    ? `/vaults/${vaultId}?folderId=${activeDocument.folderId}`
    : `/vaults/${vaultId}`
  const documentReturnPath = isTrashDocumentRoute ? "/trash" : vaultReturnPath
  const currentName = renameValue ?? document?.name ?? ""
  const currentLanguage = languageValue ?? document?.language?.code ?? "unknown"
  const hasNameChanged = document ? currentName.trim() !== document.name : false
  const hasLanguageChanged = document ? currentLanguage !== (document.language?.code ?? "unknown") : false

  async function copyMetadataValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied.`)
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}.`)
    }
  }

  async function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!document || isMetadataSaving) return

    const nextName = currentName.trim() || document.name
    const nextLanguage = currentLanguage === "unknown" ? null : currentLanguage

    setIsMetadataSaving(true)

    try {
      let nextDocument = document

      if (hasNameChanged) {
        const result = await renameDocument({ vaultId, documentId, name: nextName })
        nextDocument = {
          ...nextDocument,
          name: result.document.name,
          updatedAt: result.document.updatedAt,
        }
        setEffectiveTreeDocuments((currentDocuments) =>
          currentDocuments.map((treeDocument) =>
            treeDocument.id === documentId
              ? { ...treeDocument, name: result.document.name, updatedAt: result.document.updatedAt }
              : treeDocument
          )
        )
      }

      if (hasLanguageChanged) {
        const result = await updateDocumentLanguage({ vaultId, documentId, language: nextLanguage })
        nextDocument = {
          ...nextDocument,
          language: result.document.language,
          updatedAt: result.document.updatedAt,
        }
        setEffectiveTreeDocuments((currentDocuments) =>
          currentDocuments.map((treeDocument) =>
            treeDocument.id === documentId
              ? { ...treeDocument, language: result.document.language, updatedAt: result.document.updatedAt }
              : treeDocument
          )
        )
      }

      setDocument(nextDocument)
      setRenameValue(null)
      setLanguageValue(null)
      setIsNameEditing(false)
      setIsLanguageEditing(false)

      if (hasNameChanged || hasLanguageChanged) {
        toast.success("Metadata saved.")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save metadata.")
    } finally {
      setIsMetadataSaving(false)
    }
  }

  const handlePrintDocument = useCallback(() => {
    if (!activeDocument || !canPrint) return

    printDocumentPreview({
      documentName: activeDocument.name,
      inlineFileUrl,
      previewKind,
      onPrintWindowError: () => toast.error("Could not open print dialog."),
    })
  }, [activeDocument, canPrint, inlineFileUrl, previewKind])

  const openVaultContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setVaultContextMenu({
      x: event.clientX,
      y: event.clientY,
      vaultName: vault?.name ?? "Vault",
    })
  }, [vault?.name])

  async function handleDeleteDocument() {
    if (!document || isDeleteDocumentPending) return

    setIsDeleteDocumentPending(true)

    try {
      await softDeleteDocument({ vaultId, documentId })
      setEffectiveTreeDocuments((currentDocuments) =>
        currentDocuments.filter((treeDocument) => treeDocument.id !== documentId)
      )
      if (usesVaultRouteShell && refreshVaultShell) {
        void refreshVaultShell()
      }
      toast.success("Document moved to trash.")
      setIsDeleteDocumentDialogOpen(false)
      navigate(documentReturnPath, { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete document.")
    } finally {
      setIsDeleteDocumentPending(false)
    }
  }

  async function handleRestoreDocument(conflictStrategy?: UploadConflictStrategy) {
    if (!document || isRestoreDocumentPending) return

    setIsRestoreDocumentPending(true)

    try {
      const result = await restoreDocument({ vaultId, documentId, conflictStrategy })
      toast.success(result.skipped ? "Restore skipped." : "Document restored.")
      setRestoreConflict(null)

      if (isTrashDocumentRoute && !result.skipped) {
        navigate("/trash", { replace: true })
      } else if (!result.skipped) {
        await refreshDocumentState()
      }
    } catch (error) {
      const conflict = getDocumentDuplicateConflict(error)
      if (conflict !== null && conflict.availableStrategies.length > 0) {
        setRestoreConflict(conflict)
        return
      }

      toast.error(error instanceof Error ? error.message : "Could not restore document.")
    } finally {
      setIsRestoreDocumentPending(false)
    }
  }

  const refreshDocumentState = useCallback(async () => {
    const [documentResult, treeResult, versionsResult] = await Promise.all([
      getDocument({ vaultId, documentId }),
      usesVaultRouteShell && refreshVaultShell ? refreshVaultShell().then(() => null) : listFolderTree({ vaultId }),
      listDocumentVersions({ vaultId, documentId }),
    ])
    const hydratedDocument = isTrashDocumentRoute
      ? documentResult.document
      : await hydrateDocumentTags({ vaultId, document: documentResult.document })

    setDocument(hydratedDocument)
    if (treeResult !== null) {
      setStandaloneFolders(treeResult.folders)
      setStandaloneTreeDocuments(treeResult.documents)
    }
    setVersions(versionsResult.versions)
  }, [documentId, isTrashDocumentRoute, refreshVaultShell, usesVaultRouteShell, vaultId])

  const handleAssignTag = useCallback(async (targetDocumentId: string, tagId: string) => {
    if (!vaultId || isTrashDocumentRoute || selectedVersionId !== null || tagMutationPending) {
      return
    }

    setTagMutationPending(true)
    try {
      await assignTagToDocument({ vaultId, documentId: targetDocumentId, tagId })
      await Promise.all([refreshDocumentState(), refreshTags()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign tag.")
    } finally {
      setTagMutationPending(false)
    }
  }, [isTrashDocumentRoute, refreshDocumentState, refreshTags, selectedVersionId, tagMutationPending, vaultId])

  const handleRemoveTag = useCallback(async (targetDocumentId: string, tagId: string) => {
    if (!vaultId || isTrashDocumentRoute || selectedVersionId !== null || tagMutationPending) {
      return
    }

    setTagMutationPending(true)
    try {
      await removeTagFromDocument({ vaultId, documentId: targetDocumentId, tagId })
      await Promise.all([refreshDocumentState(), refreshTags()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove tag.")
    } finally {
      setTagMutationPending(false)
    }
  }, [isTrashDocumentRoute, refreshDocumentState, refreshTags, selectedVersionId, tagMutationPending, vaultId])

  const openCreateTagDialog = useCallback((targetDocumentId: string, name: string) => {
    setCreateTagTargetDocumentId(targetDocumentId)
    setCreateTagName(name)
    setCreateTagColor(DEFAULT_TAG_COLOR)
    setCreateTagDescription("")
  }, [])

  const closeCreateTagDialog = useCallback(() => {
    if (tagMutationPending) {
      return
    }

    setCreateTagTargetDocumentId(null)
    setCreateTagName("")
    setCreateTagColor(DEFAULT_TAG_COLOR)
    setCreateTagDescription("")
  }, [tagMutationPending])

  const handleCreateTagSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedName = createTagName.trim()
    if (
      !vaultId ||
      isTrashDocumentRoute ||
      selectedVersionId !== null ||
      createTagTargetDocumentId === null ||
      normalizedName.length === 0 ||
      tagMutationPending
    ) {
      return
    }

    setTagMutationPending(true)
    try {
      const result = await createTag({
        name: normalizedName,
        color: createTagColor || null,
        description: createTagDescription.trim() || null,
      })
      await assignTagToDocument({
        vaultId,
        documentId: createTagTargetDocumentId,
        tagId: result.tag.id,
      })
      await Promise.all([refreshDocumentState(), refreshTags()])
      setCreateTagTargetDocumentId(null)
      setCreateTagName("")
      setCreateTagColor(DEFAULT_TAG_COLOR)
      setCreateTagDescription("")
      toast.success("Tag created.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create tag.")
    } finally {
      setTagMutationPending(false)
    }
  }, [
    createTagColor,
    createTagDescription,
    createTagName,
    createTagTargetDocumentId,
    isTrashDocumentRoute,
    refreshDocumentState,
    refreshTags,
    selectedVersionId,
    tagMutationPending,
    vaultId,
  ])

  const documentHeaderTags = useMemo(() => {
    if (!activeDocument || isTrashDocumentRoute) return null

    return (
      <DocumentTagsCell
        document={activeDocument}
        availableTags={tags}
        disabled={!canEditDocumentTags || tagMutationPending}
        onAssignTag={handleAssignTag}
        onOpenCreateTagDialog={openCreateTagDialog}
        onRemoveTag={handleRemoveTag}
      />
    )
  }, [
    activeDocument,
    canEditDocumentTags,
    handleAssignTag,
    handleRemoveTag,
    isTrashDocumentRoute,
    openCreateTagDialog,
    tagMutationPending,
    tags,
  ])

  function closeDeleteVersionDialog() {
    setVersionPendingDelete(null)
    setDeleteImpact(null)
    setDeleteImpactError(null)
    setIsDeleteImpactLoading(false)
  }

  function openDeleteVersionDialog(version: DocumentVersionSummary) {
    setVersionPendingDelete(version)
    setDeleteImpact(null)
    setDeleteImpactError(null)
    setIsDeleteImpactLoading(true)

    void getDocumentVersionDeletionImpact({
      vaultId,
      documentId,
      versionId: version.id,
      limit: 5,
    })
      .then(({ impact }) => {
        setDeleteImpact(impact)
      })
      .catch((error) => {
        setDeleteImpactError(
          error instanceof Error ? error.message : "Could not check affected conversations."
        )
      })
      .finally(() => {
        setIsDeleteImpactLoading(false)
      })
  }

  async function handleRestoreVersion(version: DocumentVersionSummary) {
    if (!isVersionRestorable(version) || isRestoreVersionPending) return

    setIsRestoreVersionPending(true)

    try {
      await restoreDocumentVersion({ vaultId, documentId, versionId: version.id })
      setSelectedVersionId(null)
      setSelectedVersion(null)
      await refreshDocumentState()
      toast.success("Version restored as latest.")
      setVersionPendingRestore(null)
      setTab("preview")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore version.")
    } finally {
      setIsRestoreVersionPending(false)
    }
  }

  async function handleDeleteVersion(version: DocumentVersionSummary) {
    if (!isVersionDeletable(version) || isDeleteVersionPending) return

    setIsDeleteVersionPending(true)

    try {
      await deleteDocumentVersion({ vaultId, documentId, versionId: version.id })
      if (selectedVersionId === version.id) {
        setSelectedVersionId(null)
        setSelectedVersion(null)
      }
      await refreshDocumentState()
      toast.success("Version deleted.")
      closeDeleteVersionDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete version.")
    } finally {
      setIsDeleteVersionPending(false)
    }
  }

  useEffect(() => {
    if (!usesVaultRouteShell || !setShellHeaderConfig) return

    if (loadingDocument && document && activeDocument) {
      return
    }

    if (loadingDocument || errorMessage || !document || !activeDocument) {
      setShellHeaderConfig({
        iconKey: "document-file",
        contentKey: `document-loading:${loadingDocument ? "loading" : errorMessage ?? "document"}`,
        icon: (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-xs font-semibold text-red-600 dark:text-red-300 md:size-12">
            <FileText className="size-5" />
          </div>
        ),
        title: loadingDocument ? "Loading document..." : "Document",
        subtitle: errorMessage ? <span>{errorMessage}</span> : null,
      })

      return
    }

    setShellHeaderConfig({
      iconKey: activeDocument.mimeType === "application/pdf" ? "document-pdf" : "document-file",
      contentKey: `document:${documentId}:${selectedVersionId ?? "current"}:${activeDocument.updatedAt}:${activeDocument.tags?.map((tag) => tag.id).join(",") ?? ""}`,
      icon: (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-xs font-semibold text-red-600 dark:text-red-300 md:size-12">
          {activeDocument.mimeType === "application/pdf" ? "PDF" : <FileText className="size-5" />}
        </div>
      ),
      title: getDocumentTitle(activeDocument.name),
      badge: selectedVersionId !== null ? <Badge variant="secondary">Historical version</Badge> : null,
      subtitle: (
        <>
          <span>Updated {formatDate(activeDocument.updatedAt)}</span>
          {documentHeaderTags ? (
            <>
              <span aria-hidden="true">·</span>
              {documentHeaderTags}
            </>
          ) : null}
        </>
      ),
      actions: (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label={`Open actions for ${activeDocument.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setTab("preview")}>
                <ImageIcon className="size-4" />
                Preview
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTab("content")}>
                <ScanText className="size-4" />
                Text and chunks
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTab("metadata")}>
                <Info className="size-4" />
                Metadata
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTab("versions")}>
                <RefreshCw className="size-4" />
                Versions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={currentDownloadUrl}>
                  <Download className="size-4" />
                  Download latest
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canPrint} onSelect={handlePrintDocument}>
                <Printer className="size-4" />
                Print
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={isDeleteDocumentPending}
                onSelect={() => setIsDeleteDocumentDialogOpen(true)}
              >
                <Trash2 className="size-4" />
                {isDeleteDocumentPending ? "Deleting..." : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="outline" size="icon" aria-label="Close document detail" onClick={() => navigate(documentReturnPath)}>
            <X className="size-4" />
          </Button>
        </>
      ),
    })

  }, [
    activeDocument,
    canPrint,
    currentDownloadUrl,
    document,
    documentId,
    documentHeaderTags,
    documentReturnPath,
    errorMessage,
    handlePrintDocument,
    isDeleteDocumentPending,
    loadingDocument,
    navigate,
    selectedVersionId,
    setShellHeaderConfig,
    usesVaultRouteShell,
  ])

  useEffect(() => {
    if (!usesVaultRouteShell || !setShellHeaderConfig) return
    return () => setShellHeaderConfig(null)
  }, [setShellHeaderConfig, usesVaultRouteShell])

  useEffect(() => {
    if (!usesVaultRouteShell || !setShellSidebarConfig) return

    setShellSidebarConfig({
      currentFolderId: activeDocument?.folderId ?? null,
      currentDocumentId: documentId,
      onSelectVault: () => navigate(`/vaults/${vaultId}`),
      onSelectFolder: (folderId) => {
        navigate(folderId ? `/vaults/${vaultId}?folderId=${folderId}` : `/vaults/${vaultId}`)
      },
      onSelectDocument: (selectedVaultId, selectedDocumentId) => {
        navigate(`/vaults/${selectedVaultId}/${selectedDocumentId}`)
      },
      onOpenVaultContextMenu: openVaultContextMenu,
    })
  }, [activeDocument?.folderId, documentId, navigate, openVaultContextMenu, setShellSidebarConfig, usesVaultRouteShell, vaultId])

  useEffect(() => {
    if (!usesVaultRouteShell || !setShellSidebarConfig) return
    return () => {
      setShellSidebarConfig({
        currentFolderId: null,
        currentDocumentId: null,
      })
    }
  }, [setShellSidebarConfig, usesVaultRouteShell])

  const documentPanels = activeDocument && document ? (
    <>
      {tab === "preview" ? (
        <PreviewPanel
          previewKind={previewKind}
          document={activeDocument}
          vaultId={vaultId}
          documentId={documentId}
          inlineFileUrl={inlineFileUrl}
          downloadUrl={downloadUrl}
          selectedVersionId={selectedVersionId}
          aiFeaturesEnabled={!isTrashDocumentRoute && aiFeaturesEnabled}
        />
      ) : null}

      {tab === "content" && !isTrashDocumentRoute ? (
        <div className="m-3 flex h-[calc(100%_-_1.5rem)] min-h-0 flex-col gap-3 overflow-hidden rounded-lg bg-background p-3">
          <DocumentContentTabs value={contentTab} onValueChange={setContentTab} />
          {contentTab === "text" ? (
            <ScrollArea className="min-h-0 flex-1 bg-background">
              <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6">{extractedTextMessage}</pre>
            </ScrollArea>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <ChunkList chunks={chunks} loading={loadingChunks} error={chunksError} />
            </ScrollArea>
          )}
        </div>
      ) : null}

      {tab === "metadata" ? (
        <ScrollArea className="m-3 h-[calc(100%_-_1.5rem)] overflow-hidden rounded-lg bg-background p-4">
          <DocumentMetadataPanel
            document={document}
            currentName={currentName}
            currentLanguage={currentLanguage}
            isNameEditing={isNameEditing}
            isLanguageEditing={isLanguageEditing}
            isMetadataSaving={isMetadataSaving}
            hasNameChanged={hasNameChanged}
            hasLanguageChanged={hasLanguageChanged}
            onNameChange={setRenameValue}
            onLanguageChange={setLanguageValue}
            onEditName={() => setIsNameEditing(true)}
            onEditLanguage={() => setIsLanguageEditing(true)}
            editsDisabled={isTrashDocumentRoute}
            onCopyMetadataValue={(value, label) => {
              void copyMetadataValue(value, label)
            }}
            onSubmit={handleMetadataSave}
          />
        </ScrollArea>
      ) : null}

      {tab === "versions" && !isTrashDocumentRoute ? (
        <ScrollArea className="m-3 h-[calc(100%_-_1.5rem)] overflow-hidden rounded-lg bg-background p-4">
          <section>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Versions</h2>
              <p className="mt-1 text-base text-muted-foreground">
                Review, download, restore, or delete uploaded document versions.
              </p>
            </div>
            <div className="pt-6">
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No historical versions are available.</p>
              ) : (
                <div className="divide-y divide-border">
                  {versions.map((version) => {
                    const isSelected =
                      selectedVersionId === version.id ||
                      (selectedVersionId === null && version.isCurrent)

                    return (
                      <div
                        key={version.id}
                        className="flex flex-col gap-4 py-6 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0 flex-1 px-0 lg:pr-6">
                          <div className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight">
                            <span>Version {version.versionNumber}</span>
                            {version.isCurrent ? <Badge variant="secondary">Latest version</Badge> : null}
                            {version.restoredFromVersionId ? <Badge variant="outline">Restored</Badge> : null}
                          </div>
                          <div className="mt-1 max-w-[44rem] truncate font-mono text-base text-muted-foreground">
                            {version.originalName}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
                            <span>Uploaded {formatDate(version.uploadedAt)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatBytes(version.originalSize)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{getVersionStatusLabel(version)}</span>
                            {isSelected && !version.isCurrent ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Open in preview</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 lg:shrink-0 lg:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedVersionId(version.isCurrent ? null : version.id)
                              setTab("preview")
                            }}
                          >
                            View
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <a href={getDocumentVersionDownloadUrl({ vaultId, documentId, versionId: version.id })}>
                              <Download className="size-4" />
                              Download
                            </a>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!isVersionRestorable(version) || isRestoreVersionPending || isDeleteVersionPending}
                            onClick={() => setVersionPendingRestore(version)}
                          >
                            <RotateCcw className="size-4" />
                            Restore
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={!isVersionDeletable(version) || isRestoreVersionPending || isDeleteVersionPending}
                            onClick={() => openDeleteVersionDialog(version)}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </ScrollArea>
      ) : null}
    </>
  ) : null
  const Frame = usesVaultRouteShell ? Fragment : BaseLayout

  return (
    <Frame>
      {vaultContextMenu ? (
        <VaultContextMenu
          state={vaultContextMenu}
          canCreateItems={false}
          onClose={() => setVaultContextMenu(null)}
          onCreateFolder={() => undefined}
          onUploadFiles={() => undefined}
          onUploadFolder={() => undefined}
        />
      ) : null}
      {usesVaultRouteShell ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loadingDocument ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading document...
            </div>
          ) : errorMessage || !document || !activeDocument ? (
            <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive lg:m-6">
              {errorMessage ?? "Unable to load document."}
            </div>
          ) : (
            <>
              {isProcessingActive(activeDocument.processingStatus) || activeDocument.processingStatus === "failed" ? (
                <div
                  className={cn(
                    "mx-4 mt-3 shrink-0 rounded-lg border p-3 text-sm md:mx-5",
                    activeDocument.processingStatus === "failed"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-border bg-muted text-muted-foreground"
                  )}
                >
                  {getProcessingMessage(activeDocument, "")}
                </div>
              ) : null}

              {loadingVersion ? (
                <div className="mx-4 mt-3 flex h-14 shrink-0 items-center justify-center gap-2 rounded-lg border bg-muted/20 text-sm text-muted-foreground md:mx-5">
                  <Loader2 className="size-4 animate-spin" />
                  Loading version...
                </div>
              ) : null}

              <div className="min-h-0 flex-1">{documentPanels}</div>
            </>
          )}
        </div>
      ) : (
      <div className="-my-4 md:-my-6">
        <section className="flex h-[calc(100svh-var(--header-height))] min-h-0 flex-col overflow-hidden bg-background">
          {loadingDocument ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading document...
            </div>
          ) : errorMessage || !document || !activeDocument ? (
            <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive lg:m-6">
              {errorMessage ?? "Unable to load document."}
            </div>
          ) : (
            <>
              <header className="sticky top-0 z-20 flex shrink-0 items-start gap-3 border-b bg-background p-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-xs font-semibold text-red-600 dark:text-red-300 md:size-12">
                  {activeDocument.mimeType === "application/pdf" ? "PDF" : <FileText className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight md:text-2xl">
                      {getDocumentTitle(activeDocument.name)}
                    </h1>
                    {selectedVersionId !== null ? <Badge variant="secondary">Historical version</Badge> : null}
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>Updated {formatDate(activeDocument.updatedAt)}</span>
                    {documentHeaderTags ? (
                      <>
                        <span aria-hidden="true">·</span>
                        {documentHeaderTags}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant={isStandaloneVaultTreeVisible ? "secondary" : "outline"}
                    aria-label={standaloneVaultTreeToggleLabel}
                    aria-pressed={isStandaloneVaultTreeVisible}
                    className="gap-2"
                    onClick={() => setIsStandaloneVaultTreeVisible(!isStandaloneVaultTreeVisible)}
                  >
                    {isStandaloneVaultTreeVisible ? (
                      <PanelLeftClose className="size-4" />
                    ) : (
                      <PanelLeftOpen className="size-4" />
                    )}
                    <span>{standaloneVaultTreeToggleLabel}</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="icon" aria-label={`Open actions for ${activeDocument.name}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onSelect={() => setTab("preview")}>
                        <ImageIcon className="size-4" />
                        Preview
                      </DropdownMenuItem>
                      {!isTrashDocumentRoute ? (
                        <DropdownMenuItem onSelect={() => setTab("content")}>
                          <ScanText className="size-4" />
                          Text and chunks
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onSelect={() => setTab("metadata")}>
                        <Info className="size-4" />
                        Metadata
                      </DropdownMenuItem>
                      {!isTrashDocumentRoute ? (
                        <DropdownMenuItem onSelect={() => setTab("versions")}>
                          <RefreshCw className="size-4" />
                          Versions
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      {!isTrashDocumentRoute ? (
                        <DropdownMenuItem asChild>
                          <a href={currentDownloadUrl}>
                            <Download className="size-4" />
                            Download latest
                          </a>
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem disabled={!canPrint} onSelect={handlePrintDocument}>
                        <Printer className="size-4" />
                        Print
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {isTrashDocumentRoute ? (
                        <DropdownMenuItem
                          disabled={isRestoreDocumentPending}
                          onSelect={() => {
                            void handleRestoreDocument()
                          }}
                        >
                          <RotateCcw className="size-4" />
                          {isRestoreDocumentPending ? "Restoring..." : "Restore"}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={isDeleteDocumentPending}
                          onSelect={() => setIsDeleteDocumentDialogOpen(true)}
                        >
                          <Trash2 className="size-4" />
                          {isDeleteDocumentPending ? "Deleting..." : "Delete"}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button type="button" variant="outline" size="icon" aria-label="Close document detail" onClick={() => navigate(documentReturnPath)}>
                    <X className="size-4" />
                  </Button>
                </div>
              </header>

              {isProcessingActive(activeDocument.processingStatus) || activeDocument.processingStatus === "failed" ? (
                <div
                  className={cn(
                    "mx-4 mt-3 shrink-0 rounded-lg border p-3 text-sm md:mx-5",
                    activeDocument.processingStatus === "failed"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-border bg-muted text-muted-foreground"
                  )}
                >
                  {getProcessingMessage(activeDocument, "")}
                </div>
              ) : null}

              {loadingVersion ? (
                <div className="mx-4 mt-3 flex h-14 shrink-0 items-center justify-center gap-2 rounded-lg border bg-muted/20 text-sm text-muted-foreground md:mx-5">
                  <Loader2 className="size-4 animate-spin" />
                  Loading version...
                </div>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                {isStandaloneVaultTreeVisible ? (
                  <aside className="flex h-56 shrink-0 flex-col border-b bg-muted/20 md:h-auto md:w-80 md:border-r md:border-b-0">
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-3">
                        {vault ? (
                          <VaultSidebarTree
                            vaults={[{ id: vault.id, name: vault.name }]}
                            activeVaultId={vaultId}
                            activeVaultRootOnly
                            expandedValue={vaultTreeExpandedValue}
                            onExpandedValueChange={setVaultTreeExpandedValue}
                            currentFolderId={activeDocument.folderId}
                            currentDocumentId={documentId}
                            folders={folders}
                            documents={treeDocuments}
                            onSelectVault={() => navigate(`/vaults/${vaultId}`)}
                            onSelectFolder={(folderId) => {
                              navigate(folderId ? `/vaults/${vaultId}?folderId=${folderId}` : `/vaults/${vaultId}`)
                            }}
                            onSelectDocument={(selectedVaultId, selectedDocumentId) => {
                              navigate(`/vaults/${selectedVaultId}/${selectedDocumentId}`)
                            }}
                            onOpenVaultContextMenu={openVaultContextMenu}
                          />
                        ) : (
                          <div className="px-2 py-3 text-sm text-muted-foreground">Loading tree...</div>
                        )}
                      </div>
                    </ScrollArea>
                  </aside>
                ) : null}

                <div className="min-h-0 flex-1">
                {tab === "preview" ? (
                  <PreviewPanel
                    previewKind={previewKind}
                    document={activeDocument}
                    vaultId={vaultId}
                    documentId={documentId}
                    inlineFileUrl={inlineFileUrl}
                    downloadUrl={downloadUrl}
                    selectedVersionId={selectedVersionId}
                    aiFeaturesEnabled={!isTrashDocumentRoute && aiFeaturesEnabled}
                  />
                ) : null}

                {tab === "content" && !isTrashDocumentRoute ? (
                  <div className="m-3 flex h-[calc(100%_-_1.5rem)] min-h-0 flex-col gap-3 overflow-hidden rounded-lg bg-background p-3">
                    <DocumentContentTabs value={contentTab} onValueChange={setContentTab} />
                    {contentTab === "text" ? (
                      <ScrollArea className="min-h-0 flex-1 bg-background">
                        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6">{extractedTextMessage}</pre>
                      </ScrollArea>
                    ) : (
                      <ScrollArea className="min-h-0 flex-1">
                        <ChunkList chunks={chunks} loading={loadingChunks} error={chunksError} />
                      </ScrollArea>
                    )}
                  </div>
                ) : null}

                {tab === "metadata" ? (
                  <ScrollArea className="m-3 h-[calc(100%_-_1.5rem)] overflow-hidden rounded-lg bg-background p-4">
                    <DocumentMetadataPanel
                      document={document}
                      currentName={currentName}
                      currentLanguage={currentLanguage}
                      isNameEditing={isNameEditing}
                      isLanguageEditing={isLanguageEditing}
                      isMetadataSaving={isMetadataSaving}
                      hasNameChanged={hasNameChanged}
                      hasLanguageChanged={hasLanguageChanged}
                      onNameChange={setRenameValue}
                      onLanguageChange={setLanguageValue}
                      onEditName={() => setIsNameEditing(true)}
                      onEditLanguage={() => setIsLanguageEditing(true)}
                      editsDisabled={isTrashDocumentRoute}
                      onCopyMetadataValue={(value, label) => {
                        void copyMetadataValue(value, label)
                      }}
                      onSubmit={handleMetadataSave}
                    />
                  </ScrollArea>
                ) : null}

                {tab === "versions" && !isTrashDocumentRoute ? (
                  <ScrollArea className="m-3 h-[calc(100%_-_1.5rem)] overflow-hidden rounded-lg bg-background p-4">
                    <section>
                      <div>
                        <h2 className="text-2xl font-semibold tracking-tight">Versions</h2>
                        <p className="mt-1 text-base text-muted-foreground">
                          Review, download, restore, or delete uploaded document versions.
                        </p>
                      </div>
                      <div className="pt-6">
                        {versions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No historical versions are available.</p>
                        ) : (
                          <div className="divide-y divide-border">
                            {versions.map((version) => {
                              const isSelected =
                                selectedVersionId === version.id ||
                                (selectedVersionId === null && version.isCurrent)

                              return (
                              <div
                                key={version.id}
                                className="flex flex-col gap-4 py-6 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between"
                              >
                                <div className="min-w-0 flex-1 px-0 lg:pr-6">
                                  <div className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight">
                                    <span>Version {version.versionNumber}</span>
                                    {version.isCurrent ? <Badge variant="secondary">Latest version</Badge> : null}
                                    {version.restoredFromVersionId ? <Badge variant="outline">Restored</Badge> : null}
                                  </div>
                                  <div className="mt-1 max-w-[44rem] truncate font-mono text-base text-muted-foreground">
                                    {version.originalName}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
                                    <span>Uploaded {formatDate(version.uploadedAt)}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{formatBytes(version.originalSize)}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>{getVersionStatusLabel(version)}</span>
                                    {isSelected && !version.isCurrent ? (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span>Open in preview</span>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-3 lg:shrink-0 lg:justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedVersionId(version.isCurrent ? null : version.id)
                                      setTab("preview")
                                    }}
                                  >
                                    View
                                  </Button>
                                  <Button asChild variant="outline" size="sm">
                                    <a href={getDocumentVersionDownloadUrl({ vaultId, documentId, versionId: version.id })}>
                                      <Download className="size-4" />
                                      Download
                                    </a>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!isVersionRestorable(version) || isRestoreVersionPending || isDeleteVersionPending}
                                    onClick={() => setVersionPendingRestore(version)}
                                  >
                                    <RotateCcw className="size-4" />
                                    Restore
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    disabled={!isVersionDeletable(version) || isRestoreVersionPending || isDeleteVersionPending}
                                    onClick={() => openDeleteVersionDialog(version)}
                                  >
                                    <Trash2 className="size-4" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </section>
                  </ScrollArea>
                ) : null}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      )}
      <TagFormDialog
        open={createTagTargetDocumentId !== null}
        mode="create"
        isPending={tagMutationPending}
        name={createTagName}
        color={createTagColor}
        description={createTagDescription}
        isDirty={isCreateTagDialogDirty}
        onNameChange={setCreateTagName}
        onColorChange={setCreateTagColor}
        onDescriptionChange={setCreateTagDescription}
        onOpenChange={(open) => {
          if (!open) {
            closeCreateTagDialog()
          }
        }}
        onSubmit={handleCreateTagSubmit}
      />
      <Dialog
        open={isDeleteDocumentDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleteDocumentPending) {
            setIsDeleteDocumentDialogOpen(open)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              This moves the document to trash. Its versions are kept with the document and can be restored from trash.
            </DialogDescription>
          </DialogHeader>
          {document ? (
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="truncate font-medium">{document.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatBytes(document.originalSize)} · {document.mimeType || "Unknown type"}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleteDocumentPending}
              onClick={() => setIsDeleteDocumentDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleteDocumentPending}
              onClick={() => {
                void handleDeleteDocument()
              }}
            >
              {isDeleteDocumentPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DocumentRestoreConflictDialog
        conflict={restoreConflict}
        isPending={isRestoreDocumentPending}
        onClose={() => setRestoreConflict(null)}
        onResolve={(strategy) => {
          void handleRestoreDocument(strategy)
        }}
      />
      <Dialog
        open={versionPendingRestore !== null}
        onOpenChange={(open) => {
          if (!open && !isRestoreVersionPending) {
            setVersionPendingRestore(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {versionPendingRestore
                ? `Restore version ${versionPendingRestore.versionNumber}?`
                : "Restore version?"}
            </DialogTitle>
            <DialogDescription>
              Restoring creates a new latest version. The historical version remains in the version list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isRestoreVersionPending}
              onClick={() => setVersionPendingRestore(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={versionPendingRestore === null || isRestoreVersionPending}
              onClick={() => {
                if (versionPendingRestore === null) return
                void handleRestoreVersion(versionPendingRestore)
              }}
            >
              {isRestoreVersionPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                "Restore"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={versionPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleteVersionPending) {
            closeDeleteVersionDialog()
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {versionPendingDelete
                ? `Delete version ${versionPendingDelete.versionNumber}?`
                : "Delete version?"}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm">
            {isDeleteImpactLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Checking affected conversations...
              </div>
            ) : deleteImpactError !== null ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="size-4" />
                <span>{deleteImpactError}</span>
              </div>
            ) : deleteImpact !== null && deleteImpact.affectedConversationCount > 0 ? (
              <div className="space-y-3 text-muted-foreground">
                <p>
                  This version is referenced by {deleteImpact.affectedConversationCount}{" "}
                  {deleteImpact.affectedConversationCount === 1 ? "conversation" : "conversations"}.
                </p>
                <p>Deleting it will preserve conversation history, remove source content, and make affected conversations read-only.</p>
                <div>
                  <p>Affected conversations:</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {deleteImpact.affectedConversations.map((conversation) => (
                      <li key={conversation.id} className="break-words">
                        {conversation.title}
                      </li>
                    ))}
                  </ul>
                </div>
                {deleteImpact.affectedConversationCount > deleteImpact.affectedConversations.length ? (
                  <p>
                    Showing {deleteImpact.affectedConversations.length} of{" "}
                    {deleteImpact.affectedConversationCount} conversations.
                  </p>
                ) : null}
              </div>
            ) : (
              <DialogDescription>
                This removes this older version from the version history. The current file stays unchanged.
              </DialogDescription>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleteVersionPending || isDeleteImpactLoading}
              onClick={closeDeleteVersionDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                versionPendingDelete === null ||
                isDeleteVersionPending ||
                isDeleteImpactLoading ||
                deleteImpactError !== null
              }
              onClick={() => {
                if (versionPendingDelete === null) return
                void handleDeleteVersion(versionPendingDelete)
              }}
            >
              {isDeleteVersionPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete version"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Frame>
  )
}
