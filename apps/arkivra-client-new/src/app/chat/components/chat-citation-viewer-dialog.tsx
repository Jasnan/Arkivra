"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ExternalLink, FileText, Loader2, RotateCcw, XIcon, ZoomIn, ZoomOut } from "lucide-react"

import {
  type CitationBoundingBox,
  getCitationHref,
  getCitationLabel,
  OPEN_CHAT_CITATION_EVENT,
  type ChatCitation,
  type OpenChatCitationEvent,
} from "@/app/chat/components/assistant-ui/citations"
import {
  getDocument,
  getDocumentDownloadUrl,
  getDocumentFileText,
  getDocumentInlineFileUrl,
  getDocumentPagePreviewUrl,
  type DocumentDetail,
} from "@/app/vaults/vaults.api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type CitationViewerState = {
  citation: ChatCitation
  index?: number
}

const browserImagePreviewExtensions = new Set(["gif", "jpeg", "jpg", "png", "webp"])
const markdownPreviewExtensions = new Set(["md", "markdown"])
const textPreviewExtensions = new Set(["txt"])

function isRenderableBoundingBox(boundingBox: CitationBoundingBox) {
  return (
    Number.isFinite(boundingBox.pageNumber) &&
    Number.isFinite(boundingBox.x0) &&
    Number.isFinite(boundingBox.y0) &&
    Number.isFinite(boundingBox.x1) &&
    Number.isFinite(boundingBox.y1) &&
    Number.isFinite(boundingBox.layoutWidth) &&
    Number.isFinite(boundingBox.layoutHeight) &&
    boundingBox.layoutWidth > 0 &&
    boundingBox.layoutHeight > 0 &&
    boundingBox.x1 > boundingBox.x0 &&
    boundingBox.y1 > boundingBox.y0
  )
}

function getDocumentFileExtension(name: string | undefined) {
  const trimmedName = name?.trim() ?? ""
  const extension = trimmedName.split(".").pop()?.trim().toLowerCase()
  return extension && extension !== trimmedName.toLowerCase() ? extension : ""
}

function citationUsesOriginalImagePreview(citation: ChatCitation) {
  if (citation.mimeType?.toLowerCase().startsWith("image/")) {
    return true
  }

  return browserImagePreviewExtensions.has(getDocumentFileExtension(citation.documentName))
}

function getCitationTextPreviewKind(citation: ChatCitation): "markdown" | "text" | null {
  const mimeType = citation.mimeType?.toLowerCase() ?? ""
  const extension = getDocumentFileExtension(citation.documentName)

  if (mimeType === "text/markdown" || markdownPreviewExtensions.has(extension)) {
    return "markdown"
  }

  if (mimeType === "text/plain" || textPreviewExtensions.has(extension)) {
    return "text"
  }

  return null
}

function groupBoundingBoxesByPage(citation: ChatCitation) {
  const grouped = new Map<number, CitationBoundingBox[]>()
  if (citation.citationPrecision !== "box") {
    return grouped
  }

  const boxes = (citation.boundingBoxes ?? [])
    .filter(isRenderableBoundingBox)
    .sort((left, right) => left.pageNumber - right.pageNumber || left.y0 - right.y0 || left.x0 - right.x0)

  for (const box of boxes) {
    const current = grouped.get(box.pageNumber) ?? []
    current.push(box)
    grouped.set(box.pageNumber, current)
  }

  return grouped
}

function citationPreviewPages(citation: ChatCitation, groupedBoxes = groupBoundingBoxesByPage(citation)) {
  const pageNumbers = new Set<number>()
  if (citation.pageStart !== null && citation.pageStart !== undefined && citation.pageEnd !== null && citation.pageEnd !== undefined) {
    for (let pageNumber = citation.pageStart; pageNumber <= citation.pageEnd; pageNumber += 1) {
      pageNumbers.add(pageNumber)
    }
  }
  if (citation.pageStart !== null && citation.pageStart !== undefined) pageNumbers.add(citation.pageStart)
  if (citation.pageEnd !== null && citation.pageEnd !== undefined) pageNumbers.add(citation.pageEnd)
  for (const pageNumber of groupedBoxes.keys()) {
    pageNumbers.add(pageNumber)
  }
  return [...pageNumbers].sort((a, b) => a - b)
}

function initialCitationPreviewPage(citation: ChatCitation) {
  const groupedBoxes = groupBoundingBoxesByPage(citation)
  const firstBoxPage = [...groupedBoxes.keys()].sort((a, b) => a - b)[0]
  return firstBoxPage ?? citationPreviewPages(citation, groupedBoxes)[0] ?? null
}

function getBoundingBoxStyle(box: CitationBoundingBox) {
  const left = (box.x0 / box.layoutWidth) * 100
  const top = (box.y0 / box.layoutHeight) * 100
  const width = ((box.x1 - box.x0) / box.layoutWidth) * 100
  const height = ((box.y1 - box.y0) / box.layoutHeight) * 100

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  }
}

function getValidatedTextLocator(citation: ChatCitation, sourceText: string, previewKind: "markdown" | "text") {
  const locator = citation.textLocator
  const expectedSourceType = previewKind === "markdown" ? "rawMarkdown" : "rawText"
  if (
    locator === undefined ||
    locator.sourceType !== expectedSourceType ||
    !Number.isInteger(locator.startOffset) ||
    !Number.isInteger(locator.endOffset) ||
    locator.startOffset < 0 ||
    locator.endOffset <= locator.startOffset ||
    locator.endOffset > sourceText.length
  ) {
    return null
  }

  return locator
}

function renderSourceTextWithLocator(sourceText: string, locator: NonNullable<ChatCitation["textLocator"]> | null): ReactNode {
  if (locator === null) {
    return sourceText
  }

  return (
    <>
      {sourceText.slice(0, locator.startOffset)}
      <mark className="rounded bg-primary/20 px-0.5 text-inherit ring-1 ring-primary/40">
        {sourceText.slice(locator.startOffset, locator.endOffset)}
      </mark>
      {sourceText.slice(locator.endOffset)}
    </>
  )
}

function CitationTextPreview({
  citation,
  document,
  previewKind,
}: {
  citation: ChatCitation
  document: DocumentDetail | null
  previewKind: "markdown" | "text"
}) {
  const [sourceText, setSourceText] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fallbackText = document?.displayContent ?? document?.content ?? ""
  const effectiveText = sourceText || fallbackText
  const locator = sourceText ? getValidatedTextLocator(citation, effectiveText, previewKind) : null

  useEffect(() => {
    if (!citation.vaultId || !citation.documentId) return

    let ignore = false
    setLoading(true)
    setErrorMessage(null)
    setSourceText("")

    void getDocumentFileText({ vaultId: citation.vaultId, documentId: citation.documentId })
      .then((text) => {
        if (!ignore) setSourceText(text)
      })
      .catch((error) => {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load source text.")
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [citation.documentId, citation.vaultId])

  if (loading && !effectiveText.trim()) {
    return (
      <div className="flex h-full items-center justify-center gap-2 rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading citation preview...
      </div>
    )
  }

  if (errorMessage && !effectiveText.trim()) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        No text preview is available for this citation.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl rounded-md border bg-card p-4 shadow-sm md:p-6">
      <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-7">
        {renderSourceTextWithLocator(effectiveText, locator)}
      </pre>
    </div>
  )
}

function CitationPageImagePreview({
  citation,
  activePage,
  pageBoxes,
  imageUrl,
  downloadUrl,
  title,
}: {
  citation: ChatCitation
  activePage: number | null
  pageBoxes: CitationBoundingBox[]
  imageUrl: string
  downloadUrl?: string | null
  title: string
}) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    setImageLoaded(false)
    setImageError(false)
    setZoom(1)
  }, [imageUrl])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/20">
      <div className="flex shrink-0 items-center gap-2 border-b bg-background/95 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-none">{title}</h2>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Zoom out"
                onClick={() => setZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))))}
              >
                <ZoomOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Zoom in"
                onClick={() => setZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))))}
              >
                <ZoomIn className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon" variant="outline" aria-label="Reset zoom" onClick={() => setZoom(1)}>
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset</TooltipContent>
          </Tooltip>
          {downloadUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild type="button" size="icon" variant="outline">
                  <a href={downloadUrl} aria-label="Open source">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open source</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogClose asChild>
                <Button type="button" size="icon" variant="outline" aria-label="Close citation preview">
                  <XIcon className="size-4" />
                </Button>
              </DialogClose>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-8">
        <div
          className="relative mx-auto max-w-5xl overflow-hidden rounded-md bg-card shadow-sm ring-1 ring-border"
          style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "64rem" : "none" }}
        >
          <img
            src={imageUrl}
            alt={`${citation.documentName ?? "Document"}${activePage ? ` page ${activePage}` : ""}`}
            draggable={false}
            className="h-auto w-full select-none"
            onLoad={() => {
              setImageLoaded(true)
              setImageError(false)
            }}
            onError={() => {
              setImageLoaded(false)
              setImageError(true)
            }}
          />
          {imageLoaded && pageBoxes.length > 0 ? (
            <div className="pointer-events-none absolute inset-0">
              {pageBoxes.map((box, index) => (
                <div
                  key={`${box.pageNumber}-${box.x0}-${box.y0}-${box.x1}-${box.y1}-${index}`}
                  className="absolute rounded-[2px] border border-primary/70 bg-primary/10 shadow-sm"
                  style={getBoundingBoxStyle(box)}
                />
              ))}
            </div>
          ) : null}
          {imageError ? (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
              Arkivra could not render a preview image for this page.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ChatCitationViewerDialog() {
  const [viewerState, setViewerState] = useState<CitationViewerState | null>(null)
  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const citation = viewerState?.citation ?? null
  const label = citation ? getCitationLabel(citation, viewerState?.index) : "Source"
  const href = citation ? getCitationHref(citation) : undefined
  const textPreviewKind = citation ? getCitationTextPreviewKind(citation) : null
  const groupedBoxes = useMemo(() => (citation ? groupBoundingBoxesByPage(citation) : new Map<number, CitationBoundingBox[]>()), [citation])
  const activePage = useMemo(() => (citation ? initialCitationPreviewPage(citation) : null), [citation])
  const pageBoxes = activePage === null ? [] : groupedBoxes.get(activePage) ?? []
  const inlineFileUrl =
    citation?.vaultId && citation.documentId
      ? getDocumentInlineFileUrl({ vaultId: citation.vaultId, documentId: citation.documentId })
      : null
  const pagePreviewUrl =
    citation?.vaultId && citation.documentId && activePage !== null
      ? getDocumentPagePreviewUrl({ vaultId: citation.vaultId, documentId: citation.documentId, pageNumber: activePage })
      : null
  const downloadUrl =
    citation?.vaultId && citation.documentId
      ? getDocumentDownloadUrl({ vaultId: citation.vaultId, documentId: citation.documentId })
      : null
  const activePreviewUrl =
    citation === null || textPreviewKind !== null
      ? null
      : citationUsesOriginalImagePreview(citation)
        ? inlineFileUrl
        : pagePreviewUrl
  const isImagePreview = Boolean(citation && activePreviewUrl)

  useEffect(() => {
    function handleOpenCitation(event: Event) {
      const detail = (event as OpenChatCitationEvent).detail
      if (!detail?.citation?.vaultId || !detail.citation.documentId) return
      setViewerState({ citation: detail.citation, index: detail.index })
    }

    window.addEventListener(OPEN_CHAT_CITATION_EVENT, handleOpenCitation)
    return () => window.removeEventListener(OPEN_CHAT_CITATION_EVENT, handleOpenCitation)
  }, [])

  useEffect(() => {
    if (!citation?.vaultId || !citation.documentId) {
      setDocument(null)
      return
    }

    let ignore = false
    setLoading(true)
    setErrorMessage(null)
    setDocument(null)

    void getDocument({ vaultId: citation.vaultId, documentId: citation.documentId })
      .then((result) => {
        if (!ignore) {
          setDocument(result.document)
        }
      })
      .catch((error) => {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load the cited document.")
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [citation?.documentId, citation?.vaultId])

  return (
    <Dialog
      open={viewerState !== null}
      onOpenChange={(open) => {
        if (!open) {
          setViewerState(null)
          setDocument(null)
          setErrorMessage(null)
        }
      }}
    >
      <DialogContent showCloseButton={!isImagePreview} className="flex max-h-svh flex-col overflow-hidden sm:max-w-3xl">
        {isImagePreview ? null : (
          <DialogHeader className="shrink-0">
            <DialogTitle className="min-w-0 truncate">{label}</DialogTitle>
          </DialogHeader>
        )}

        <div className="min-h-0 overflow-hidden bg-background">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading document...
            </div>
          ) : errorMessage ? (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div className="max-w-md">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-3 text-base font-semibold">Could not open source</h2>
                <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
              </div>
            </div>
          ) : citation && textPreviewKind !== null ? (
            <div className="max-h-96 overflow-auto p-4 md:p-6">
              <CitationTextPreview citation={citation} document={document} previewKind={textPreviewKind} />
            </div>
          ) : citation && activePreviewUrl ? (
            <div className="h-96 overflow-hidden">
              <CitationPageImagePreview
                citation={citation}
                activePage={activePage}
                pageBoxes={pageBoxes}
                imageUrl={activePreviewUrl}
                downloadUrl={downloadUrl}
                title={label}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div className="max-w-md">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-3 text-base font-semibold">Preview unavailable</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  No page preview is available for this citation. Open the document to inspect the source.
                </p>
                {href ? (
                  <Button asChild className="mt-4">
                    <a href={href}>
                      <ExternalLink className="size-4" />
                      Open document
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
