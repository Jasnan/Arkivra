"use client"

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react"
import {
  AlertCircle,
  CalendarDays,
  ClipboardCopy,
  Download,
  FileText,
  Hash,
  Image as ImageIcon,
  Info,
  Loader2,
  MoreHorizontal,
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
import { useNavigate, useParams, useSearchParams } from "react-router-dom"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { cn } from "@/lib/utils"
import { ImagePreviewFrame as ZoomableImagePreviewFrame } from "./components/image-preview-frame"
import { PdfPreviewFrame } from "./components/pdf-preview-frame"
import { VaultContextMenu, type VaultContextMenuState } from "./components/vault-context-menu"
import { VAULT_TREE_ROOT_VALUE, VaultSidebarTree } from "./components/vault-sidebar-tree"
import {
  deleteDocumentVersion,
  getDocument,
  getDocumentDownloadUrl,
  getDocumentInlineFileUrl,
  getDocumentVersion,
  getDocumentVersionDeletionImpact,
  getDocumentVersionDownloadUrl,
  getVault,
  listDocumentChunks,
  listDocumentVersionChunks,
  listDocumentVersions,
  listFolderTree,
  renameDocument,
  softDeleteDocument,
  restoreDocumentVersion,
  updateDocumentLanguage,
  type DeletionImpactPreview,
  type DocumentChunkSummary,
  type DocumentDetail,
  type DocumentLanguageMetadata,
  type DocumentSummary,
  type DocumentVersionDetail,
  type DocumentVersionSummary,
  type FolderTreeDocumentEntry,
  type FolderTreeEntry,
  type VaultDetail,
} from "./vaults.api"

type PreviewKind = "pdf" | "image" | "text" | "pending" | "failed" | "unsupported"
type DocumentTab = "preview" | "content" | "metadata" | "versions"
type ContentTab = "text" | "chunks"

const imagePreviewExtensions = new Set(["gif", "jpeg", "jpg", "png", "webp"])
const documentFileExtensionPattern = /\.[^/.]+$/
const editableDocumentLanguages = [
  { value: "unknown", label: "Unknown" },
  { value: "de", label: "German" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
] as const

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
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function getDocumentStatusClass(status: DocumentSummary["processingStatus"]) {
  if (status === "failed") {
    return "border-destructive/40 bg-destructive/10 text-destructive"
  }

  if (status && status !== "completed") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  }

  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
}

function getDocumentStatusLabel(status: DocumentSummary["processingStatus"]) {
  if (!status || status === "completed") return "Ready"
  if (status === "partitioning") return "Parsing"
  if (status === "summarising") return "Summarising"
  return status
}

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
      return "Arkivra is parsing the source file and extracting text, layout, tables, and images."
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
        <div className="mt-1 min-w-0 text-sm font-medium">
          {children ?? <span className="break-words">{value}</span>}
        </div>
      </div>
      {action ?? copyAction}
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
  onCopyMetadataValue: (value: string, label: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const semanticIndex = document.semanticIndex
  const semanticIndexLabel = getSemanticIndexLabel(document)

  return (
    <form className="mx-auto flex min-h-full max-w-6xl flex-col gap-4 pb-5" onSubmit={onSubmit}>
      <Card className="rounded-md">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Document metadata</CardTitle>
          {isNameEditing || isLanguageEditing ? (
            <Button
              type="submit"
              size="sm"
              disabled={isMetadataSaving || (!hasNameChanged && !hasLanguageChanged)}
            >
              {isMetadataSaving ? "Saving..." : "Save"}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <MetadataItem icon={FileText} label="Original filename" value={document.originalName} copyValue={document.originalName} copyLabel="Original filename" onCopy={onCopyMetadataValue} />

          <MetadataItem
            icon={Info}
            label="Source language"
            action={
              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Edit source language" onClick={onEditLanguage}>
                <Pencil className="size-4" />
              </Button>
            }
          >
            {isLanguageEditing ? (
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
            className="md:col-span-2"
            action={
              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Edit display name" onClick={onEditName}>
                <Pencil className="size-4" />
              </Button>
            }
          >
            {isNameEditing ? (
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

          <MetadataItem icon={Info} label="Uploaded by" value={document.createdBy ?? "Unknown"} className="md:col-span-2" />
          <MetadataItem icon={CalendarDays} label="Uploaded at" value={formatDate(document.createdAt)} />
          <MetadataItem icon={CalendarDays} label="Last updated" value={formatDate(document.updatedAt)} />
          <MetadataItem icon={Search} label="Semantic index">
            <div className="flex flex-col gap-1.5">
              <Badge className="w-fit" variant={semanticIndexLabel.variant}>{semanticIndexLabel.label}</Badge>
              <span className="text-sm font-normal text-muted-foreground">{semanticIndexLabel.detail}</span>
            </div>
          </MetadataItem>
          <MetadataItem icon={Hash} label="Document ID" value={document.id} copyValue={document.id} copyLabel="Document ID" onCopy={onCopyMetadataValue} />
        </CardContent>
      </Card>
    </form>
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
          <Button type="button" size="sm" variant="outline" onClick={printImage}>
            <Printer className="size-4" />
            Print
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={downloadUrl}>
              <Download className="size-4" />
              Download
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
  inlineFileUrl,
  downloadUrl,
  selectedVersionId,
}: {
  previewKind: PreviewKind
  document: DocumentDetail
  inlineFileUrl: string
  downloadUrl: string
  selectedVersionId: string | null
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
      <ScrollArea className="h-full min-h-0 rounded-md border bg-background">
        <pre className="whitespace-pre-wrap break-words p-5 font-mono text-sm leading-6">
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
    <div className="flex h-full min-h-0 items-center justify-center rounded-md border bg-muted/20 p-8 text-center">
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
      <div className="flex min-h-80 items-center justify-center gap-2 rounded-md border bg-muted/20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading chunks...
      </div>
    )
  }

  if (error) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
  }

  if (chunks.length === 0) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        No chunks are available for this document.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {chunks.map((chunk) => (
        <Card key={chunk.id} className="rounded-md">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Chunk {chunk.chunkIndex + 1}</Badge>
              {chunk.pageNumber ? <span>Page {chunk.pageNumber}</span> : null}
              {chunk.section ? <span>{chunk.section}</span> : null}
              {chunk.tokenCount ? <span>{chunk.tokenCount} tokens</span> : null}
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {chunk.originalText || chunk.content}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function DocumentViewPage() {
  const { vaultId = "", documentId = "" } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get("tab")
  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [vault, setVault] = useState<VaultDetail | null>(null)
  const [folders, setFolders] = useState<FolderTreeEntry[]>([])
  const [treeDocuments, setTreeDocuments] = useState<FolderTreeDocumentEntry[]>([])
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
  const [vaultContextMenu, setVaultContextMenu] = useState<VaultContextMenuState | null>(null)

  useEffect(() => {
    if (requestedTab === "versions") {
      setTab("versions")
    }
  }, [requestedTab])

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
        const [documentResult, vaultResult, treeResult, versionsResult] = await Promise.all([
          getDocument({ vaultId, documentId }),
          getVault({ vaultId }),
          listFolderTree({ vaultId }),
          listDocumentVersions({ vaultId, documentId }),
        ])

        if (!ignore) {
          setDocument(documentResult.document)
          setVault(vaultResult.vault)
          setFolders(treeResult.folders)
          setTreeDocuments(treeResult.documents)
          setVersions(versionsResult.versions)
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

    if (vaultId && documentId) {
      void loadDocument()
    }

    return () => {
      ignore = true
    }
  }, [vaultId, documentId])

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
      if (tab !== "content" || contentTab !== "chunks") return

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
  }, [contentTab, documentId, selectedVersionId, tab, vaultId])

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
      ? getDocumentDownloadUrl({ vaultId, documentId })
      : getDocumentVersionDownloadUrl({ vaultId, documentId, versionId: selectedVersionId })
  const currentDownloadUrl = getDocumentDownloadUrl({ vaultId, documentId })
  const inlineFileUrl = getDocumentInlineFileUrl({ vaultId, documentId })
  const canPrint = canPrintPreview(previewKind, selectedVersionId)
  const extractedContent = activeDocument?.displayContent ?? activeDocument?.content ?? ""
  const extractedTextMessage = activeDocument
    ? getProcessingMessage(activeDocument, extractedContent)
    : "No extracted text is available yet."
  const vaultReturnPath = activeDocument?.folderId
    ? `/vaults/${vaultId}?folderId=${activeDocument.folderId}`
    : `/vaults/${vaultId}`
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
        setTreeDocuments((currentDocuments) =>
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
        setTreeDocuments((currentDocuments) =>
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

  function handlePrintDocument() {
    if (!activeDocument || !canPrint) return

    printDocumentPreview({
      documentName: activeDocument.name,
      inlineFileUrl,
      previewKind,
      onPrintWindowError: () => toast.error("Could not open print dialog."),
    })
  }

  function openVaultContextMenu(event: MouseEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    setVaultContextMenu({
      x: event.clientX,
      y: event.clientY,
      vaultName: vault?.name ?? "Vault",
    })
  }

  async function handleDeleteDocument() {
    if (!document || isDeleteDocumentPending) return

    setIsDeleteDocumentPending(true)

    try {
      await softDeleteDocument({ vaultId, documentId })
      toast.success("Document moved to trash.")
      setIsDeleteDocumentDialogOpen(false)
      navigate(vaultReturnPath, { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete document.")
    } finally {
      setIsDeleteDocumentPending(false)
    }
  }

  async function refreshDocumentState() {
    const [documentResult, treeResult, versionsResult] = await Promise.all([
      getDocument({ vaultId, documentId }),
      listFolderTree({ vaultId }),
      listDocumentVersions({ vaultId, documentId }),
    ])

    setDocument(documentResult.document)
    setFolders(treeResult.folders)
    setTreeDocuments(treeResult.documents)
    setVersions(versionsResult.versions)
  }

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

  return (
    <BaseLayout>
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
      <div className="px-4 md:px-6">
        <section className="flex h-[calc(100vh-8rem)] min-h-[640px] flex-col overflow-hidden rounded-lg border bg-background">
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
              <header className="flex shrink-0 items-start gap-3 border-b bg-background px-4 py-3 md:px-5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-xs font-semibold text-red-600 dark:text-red-300 md:size-12">
                  {activeDocument.mimeType === "application/pdf" ? "PDF" : <FileText className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight md:text-2xl">
                      {getDocumentTitle(activeDocument.name)}
                    </h1>
                    <Badge variant="outline" className={cn(getDocumentStatusClass(activeDocument.processingStatus))}>
                      {getDocumentStatusLabel(activeDocument.processingStatus)}
                    </Badge>
                    {selectedVersionId !== null ? <Badge variant="secondary">Historical version</Badge> : null}
                  </div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>{formatBytes(activeDocument.originalSize)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeDocument.mimeType || "Unknown type"}</span>
                    <span aria-hidden="true">·</span>
                    <span>Updated {formatDate(activeDocument.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                  <Button type="button" variant="outline" size="icon" aria-label="Close document detail" onClick={() => navigate(vaultReturnPath)}>
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
                      : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
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
                <aside className="flex h-56 shrink-0 flex-col border-b bg-muted/20 md:h-auto md:w-80 md:border-r md:border-b-0">
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="p-2">
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

                <div className="min-h-0 flex-1 p-3 md:p-5">
                {tab === "preview" ? (
                  <PreviewPanel
                    previewKind={previewKind}
                    document={activeDocument}
                    inlineFileUrl={inlineFileUrl}
                    downloadUrl={downloadUrl}
                    selectedVersionId={selectedVersionId}
                  />
                ) : null}

                {tab === "content" ? (
                  <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="flex shrink-0 rounded-md border p-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={contentTab === "text" ? "secondary" : "ghost"}
                        onClick={() => setContentTab("text")}
                      >
                        Extracted text
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={contentTab === "chunks" ? "secondary" : "ghost"}
                        onClick={() => setContentTab("chunks")}
                      >
                        Chunks
                      </Button>
                    </div>
                    {contentTab === "text" ? (
                      <ScrollArea className="min-h-0 flex-1 rounded-md border bg-background">
                        <pre className="whitespace-pre-wrap break-words p-5 font-mono text-sm leading-6">{extractedTextMessage}</pre>
                      </ScrollArea>
                    ) : (
                      <ScrollArea className="min-h-0 flex-1">
                        <ChunkList chunks={chunks} loading={loadingChunks} error={chunksError} />
                      </ScrollArea>
                    )}
                  </div>
                ) : null}

                {tab === "metadata" ? (
                  <ScrollArea className="h-full">
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
                      onCopyMetadataValue={(value, label) => {
                        void copyMetadataValue(value, label)
                      }}
                      onSubmit={handleMetadataSave}
                    />
                  </ScrollArea>
                ) : null}

                {tab === "versions" ? (
                  <ScrollArea className="h-full">
                    <Card className="gap-0 rounded-lg shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-2xl">Versions</CardTitle>
                        <CardDescription className="text-base">
                          Review, download, restore, or delete uploaded document versions.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-6">
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
                      </CardContent>
                    </Card>
                  </ScrollArea>
                ) : null}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
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
    </BaseLayout>
  )
}
