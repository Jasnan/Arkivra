"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  getDocument,
  getDocumentFileText,
  getDocumentInlineFileUrl,
  getDocumentPagePreviewUrl,
} from "@/app/vaults/vaults.api"
import type { Citation } from "../chat.api"

interface CitationPreviewDialogProps {
  citation: Citation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const browserImagePreviewExtensions = new Set(["gif", "jpeg", "jpg", "png", "webp"])
const markdownPreviewExtensions = new Set(["md", "markdown"])
const textPreviewExtensions = new Set(["txt"])

function isRenderableBoundingBox(boundingBox: Citation["boundingBoxes"][number]) {
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

function getDocumentFileExtension(name: string) {
  const extension = name.split(".").pop()?.trim().toLowerCase()
  return extension && extension !== name.trim().toLowerCase() ? extension : ""
}

function citationUsesOriginalImagePreview(citation: Citation) {
  if (citation.mimeType?.toLowerCase().startsWith("image/")) return true
  return browserImagePreviewExtensions.has(getDocumentFileExtension(citation.documentName))
}

function getCitationTextPreviewKind(citation: Citation): "markdown" | "text" | null {
  const mimeType = citation.mimeType?.toLowerCase() ?? ""
  const extension = getDocumentFileExtension(citation.documentName)

  if (mimeType === "text/markdown" || markdownPreviewExtensions.has(extension)) return "markdown"
  if (mimeType === "text/plain" || textPreviewExtensions.has(extension)) return "text"

  return null
}

function groupBoundingBoxesByPage(citation: Citation) {
  const grouped = new Map<number, Citation["boundingBoxes"]>()
  if (citation.citationPrecision !== "box") return grouped

  const renderableBoxes = citation.boundingBoxes
    .filter(isRenderableBoundingBox)
    .sort(
      (left, right) =>
        left.pageNumber - right.pageNumber || left.y0 - right.y0 || left.x0 - right.x0
    )

  for (const boundingBox of renderableBoxes) {
    const current = grouped.get(boundingBox.pageNumber) ?? []
    current.push(boundingBox)
    grouped.set(boundingBox.pageNumber, current)
  }

  return grouped
}

function citationPreviewPages(citation: Citation, groupedBoxes = groupBoundingBoxesByPage(citation)) {
  const pageNumbers = new Set<number>()
  if (citation.pageStart !== null && citation.pageEnd !== null) {
    for (let pageNumber = citation.pageStart; pageNumber <= citation.pageEnd; pageNumber += 1) {
      pageNumbers.add(pageNumber)
    }
  }
  if (citation.pageStart !== null) pageNumbers.add(citation.pageStart)
  if (citation.pageEnd !== null) pageNumbers.add(citation.pageEnd)
  for (const pageNumber of groupedBoxes.keys()) pageNumbers.add(pageNumber)
  return [...pageNumbers].sort((a, b) => a - b)
}

function initialCitationPreviewPage(citation: Citation) {
  const groupedBoxes = groupBoundingBoxesByPage(citation)
  const firstBoxPage = [...groupedBoxes.keys()].sort((a, b) => a - b)[0]
  return firstBoxPage ?? citationPreviewPages(citation, groupedBoxes)[0] ?? null
}

function getBoundingBoxKey(boundingBox: Citation["boundingBoxes"][number]) {
  return `${boundingBox.pageNumber}-${boundingBox.x0}-${boundingBox.y0}-${boundingBox.x1}-${boundingBox.y1}`
}

function getPageBoxesKey(pageBoxes: Citation["boundingBoxes"]) {
  return pageBoxes.map(getBoundingBoxKey).join("|")
}

function getValidatedTextLocator(
  citation: Citation,
  sourceText: string,
  previewKind: "markdown" | "text"
) {
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

function renderSourceTextWithLocator(
  sourceText: string,
  locator: NonNullable<Citation["textLocator"]> | null
): ReactNode {
  if (locator === null) return sourceText

  return (
    <>
      {sourceText.slice(0, locator.startOffset)}
      <mark data-testid="citation-text-highlight">
        {sourceText.slice(locator.startOffset, locator.endOffset)}
      </mark>
      {sourceText.slice(locator.endOffset)}
    </>
  )
}

function CitationTextPreview({
  citation,
  previewKind,
}: {
  citation: Citation
  previewKind: "markdown" | "text"
}) {
  const previewRef = useRef<HTMLPreElement>(null)
  const [fileText, setFileText] = useState<string | null>(null)
  const [documentContent, setDocumentContent] = useState("")
  const [fileTextLoading, setFileTextLoading] = useState(true)
  const [documentLoading, setDocumentLoading] = useState(true)
  const [fileTextError, setFileTextError] = useState(false)
  const [documentError, setDocumentError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFileText(null)
    setDocumentContent("")
    setFileTextLoading(true)
    setDocumentLoading(true)
    setFileTextError(false)
    setDocumentError(false)

    getDocumentFileText({ vaultId: citation.vaultId, documentId: citation.documentId })
      .then((text) => {
        if (!cancelled) setFileText(text)
      })
      .catch(() => {
        if (!cancelled) setFileTextError(true)
      })
      .finally(() => {
        if (!cancelled) setFileTextLoading(false)
      })

    getDocument({ vaultId: citation.vaultId, documentId: citation.documentId })
      .then((result) => {
        if (!cancelled) setDocumentContent(result.document.content ?? "")
      })
      .catch(() => {
        if (!cancelled) setDocumentError(true)
      })
      .finally(() => {
        if (!cancelled) setDocumentLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [citation.documentId, citation.vaultId])

  const sourceText = fileText ?? documentContent
  const canUseRawSourceLocator = fileText !== null
  const hasSourceText = sourceText.trim().length > 0
  const isLoading = (fileTextLoading || documentLoading) && !hasSourceText
  const hasError = fileTextError && documentError
  const textLocator = canUseRawSourceLocator
    ? getValidatedTextLocator(citation, sourceText, previewKind)
    : null

  useEffect(() => {
    previewRef.current
      ?.querySelector("[data-testid='citation-text-highlight']")
      ?.scrollIntoView({ block: "center" })
  }, [sourceText, textLocator])

  if (isLoading) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center rounded-md border bg-card p-8 text-sm text-muted-foreground">
        Loading citation preview...
      </div>
    )
  }

  if (hasError || !hasSourceText) {
    return (
      <div className="flex h-full min-h-80 items-center justify-center rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        No text preview is available for this citation.
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl rounded-md border bg-card p-4 shadow-sm md:p-6">
      <pre
        ref={previewRef}
        className={cn(
          "whitespace-pre-wrap break-words font-sans text-sm leading-7 text-card-foreground",
          "[&_mark]:rounded [&_mark]:bg-primary/15 [&_mark]:px-0.5 [&_mark]:text-inherit [&_mark]:ring-1 [&_mark]:ring-primary/30"
        )}
      >
        {renderSourceTextWithLocator(sourceText, textLocator)}
      </pre>
    </div>
  )
}

export function CitationPreviewDialog({
  citation,
  open,
  onOpenChange,
}: CitationPreviewDialogProps) {
  const pages = useMemo(() => (citation ? citationPreviewPages(citation) : []), [citation])
  const groupedBoxes = useMemo(
    () =>
      citation ? groupBoundingBoxesByPage(citation) : new Map<number, Citation["boundingBoxes"]>(),
    [citation]
  )
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [imageError, setImageError] = useState(false)
  const [pulseHighlightKey, setPulseHighlightKey] = useState<string | null>(null)
  const textPreviewKind = citation ? getCitationTextPreviewKind(citation) : null

  useEffect(() => {
    if (citation) {
      setSelectedPage(initialCitationPreviewPage(citation))
      setImageSize(null)
      setImageError(false)
      setPulseHighlightKey(null)
    }
  }, [citation])

  const activePage = citation ? selectedPage ?? pages[0] ?? null : null
  const usesOriginalImagePreview = citation ? citationUsesOriginalImagePreview(citation) : false
  const pageBoxes = citation && activePage !== null ? groupedBoxes.get(activePage) ?? [] : []
  let activePreviewUrl: string | null = null
  if (citation !== null && textPreviewKind === null) {
    if (usesOriginalImagePreview) {
      activePreviewUrl = getDocumentInlineFileUrl({
        vaultId: citation.vaultId,
        documentId: citation.documentId,
      })
    } else if (activePage !== null) {
      activePreviewUrl = getDocumentPagePreviewUrl({
        vaultId: citation.vaultId,
        documentId: citation.documentId,
        pageNumber: activePage,
      })
    }
  }
  const canRenderOverlay = pageBoxes.length > 0 && imageSize !== null
  const pageBoxesKey = getPageBoxesKey(pageBoxes)
  const firstPageBoxKey = pageBoxes[0] ? getBoundingBoxKey(pageBoxes[0]) : null

  useEffect(() => {
    if (
      !open ||
      textPreviewKind !== null ||
      !canRenderOverlay ||
      activePreviewUrl === null
    ) {
      return
    }

    let cancelled = false
    let timeoutId: number | undefined
    const animationFrames: number[] = []

    const runAfterRender = () => {
      if (cancelled) return
      setPulseHighlightKey(firstPageBoxKey)
      timeoutId = window.setTimeout(() => {
        if (!cancelled) setPulseHighlightKey(null)
      }, 1000)
    }

    animationFrames.push(
      window.requestAnimationFrame(() => {
        animationFrames.push(window.requestAnimationFrame(runAfterRender))
      })
    )

    return () => {
      cancelled = true
      for (const animationFrame of animationFrames) window.cancelAnimationFrame(animationFrame)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [activePreviewUrl, canRenderOverlay, firstPageBoxKey, open, pageBoxesKey, textPreviewKind])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {citation ? (
        <DialogContent className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <div className="border-b px-6 py-5">
            <DialogTitle className="break-words pr-8">{citation.documentName}</DialogTitle>
            <DialogDescription>
              {textPreviewKind !== null
                ? "Text citation"
                : usesOriginalImagePreview && activePage === null
                  ? "Image citation"
                : activePage !== null
                  ? `Page ${activePage}`
                  : "Document preview unavailable"}
            </DialogDescription>
          </div>

          <div
            data-testid="citation-preview-scroll-container"
            className="min-h-0 max-h-[calc(100vh-10rem)] overflow-auto bg-muted/40 px-6 py-5"
          >
            {textPreviewKind !== null ? (
              <CitationTextPreview citation={citation} previewKind={textPreviewKind} />
            ) : activePreviewUrl === null ? (
              <div className="flex h-full min-h-80 items-center justify-center rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                No page preview is available for this citation.
              </div>
            ) : (
              <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-md border bg-card shadow-sm">
                <div className="relative">
                  <img
                    src={activePreviewUrl}
                    alt={
                      activePage !== null
                        ? `${citation.documentName} page ${activePage}`
                        : citation.documentName
                    }
                    className="h-auto w-full rounded-md"
                    onLoad={(event) => {
                      setImageSize({
                        width: event.currentTarget.clientWidth,
                        height: event.currentTarget.clientHeight,
                      })
                      setImageError(false)
                    }}
                    onError={() => {
                      setImageSize(null)
                      setImageError(true)
                    }}
                  />

                  {canRenderOverlay ? (
                    <div className="pointer-events-none absolute inset-0">
                      {pageBoxes.map((boundingBox) => {
                        const highlightKey = getBoundingBoxKey(boundingBox)
                        const left = (boundingBox.x0 / boundingBox.layoutWidth) * imageSize.width
                        const top = (boundingBox.y0 / boundingBox.layoutHeight) * imageSize.height
                        const width =
                          ((boundingBox.x1 - boundingBox.x0) / boundingBox.layoutWidth) *
                          imageSize.width
                        const height =
                          ((boundingBox.y1 - boundingBox.y0) / boundingBox.layoutHeight) *
                          imageSize.height

                        return (
                          <div
                            key={highlightKey}
                            data-citation-highlight="true"
                            data-citation-highlight-key={highlightKey}
                            data-citation-pulsing={
                              pulseHighlightKey === highlightKey ? "true" : undefined
                            }
                            data-testid="citation-bounding-box"
                            className={cn(
                              "absolute rounded-md border-2 border-primary bg-primary/15 shadow-[0_0_0_1px_rgba(255,255,255,0.25)] [transform-origin:center]",
                              pulseHighlightKey === highlightKey &&
                                "animate-[citation-preview-highlight-pulse_900ms_ease-out_1]"
                            )}
                            style={{ left, top, width, height }}
                          />
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {imageError ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Arkivra could not render a preview image for this page.
              </p>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
