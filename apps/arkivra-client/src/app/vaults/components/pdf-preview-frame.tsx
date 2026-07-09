"use client"

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Languages,
  Loader2,
  Printer,
  SquareDashedMousePointer,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { captureCanvasRegionAsPngBase64, type NormalizedRect } from "../pdf-translation-capture"
import {
  translateDocument,
  type DocumentLanguageMetadata,
  type DocumentTranslationLanguage,
  type DocumentTranslationSource,
} from "../vaults.api"
import { PdfRegionSelectionOverlay, type RegionSelection } from "./pdf-region-selection-overlay"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

type PdfZoomMode = "fit-page" | "fit-width" | "custom"

type TranslationSourceType = DocumentTranslationSource["type"]

interface TranslationPaneState {
  status: "loading" | "success" | "error"
  targetLanguage: DocumentTranslationLanguage
  sourceType: TranslationSourceType
  pageNumber: number
  text: string
  error: string | null
  provider: string | null
  model: string | null
}

interface PdfMenuPoint {
  x: number
  y: number
}

interface TextSelectionMenuState {
  open: boolean
  point: PdfMenuPoint
  text: string
  pageNumber: number
}

interface VisualSelectionMenuState {
  open: boolean
  point: PdfMenuPoint
  pageNumber: number
}

const previewPadding = 32
const toolbarHeight = 56
const minZoom = 0.5
const maxZoom = 3
const zoomStep = 0.1
const translationLanguages: Array<{ value: DocumentTranslationLanguage; label: string }> = [
  { value: "de", label: "German" },
  { value: "en", label: "English" },
]

function clampZoom(value: number) {
  return Math.min(Math.max(value, minZoom), maxZoom)
}

function getTranslationTargetLanguages(sourceLanguage: DocumentLanguageMetadata | null | undefined) {
  const sourceCode = sourceLanguage?.code.toLocaleLowerCase().split("-")[0]

  if (sourceCode === undefined) {
    return translationLanguages
  }

  return translationLanguages.filter((language) => language.value !== sourceCode)
}

function getTranslationLanguageLabel(language: DocumentTranslationLanguage) {
  return translationLanguages.find((item) => item.value === language)?.label ?? language.toUpperCase()
}

function getTranslationSourceLabel(sourceType: TranslationSourceType) {
  if (sourceType === "page-image") {
    return "Page"
  }

  return sourceType === "area-image" ? "Selected area" : "Selected text"
}

function getAbortAwareError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Translation cancelled."
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Translation failed."
}

function getRenderedPdfCanvas(pageElement: HTMLElement | null) {
  return pageElement?.querySelector("canvas") ?? null
}

function getSelectionTextWithin(element: HTMLElement | null) {
  if (element === null) {
    return null
  }

  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ""

  if (selection === null || selection.rangeCount === 0 || text.length === 0) {
    return null
  }

  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode
  const hasEndpointInside = (node: Node | null) => node !== null && element.contains(node)

  if (!hasEndpointInside(anchorNode) && !hasEndpointInside(focusNode)) {
    return null
  }

  return text
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getNormalizedCanvasRect(selection: RegionSelection, canvas: HTMLCanvasElement): NormalizedRect {
  const bounds = canvas.getBoundingClientRect()

  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 }
  }

  const x = clamp(selection.x / bounds.width, 0, 1)
  const y = clamp(selection.y / bounds.height, 0, 1)

  return {
    x,
    y,
    width: clamp(selection.width / bounds.width, 0, 1 - x),
    height: clamp(selection.height / bounds.height, 0, 1 - y),
  }
}

export function PdfPreviewFrame({
  src,
  documentName,
  downloadUrl,
  vaultId,
  documentId,
  translationsDisabled = false,
  sourceLanguage = null,
}: {
  src: string
  documentName: string
  downloadUrl: string
  vaultId: string
  documentId: string
  translationsDisabled?: boolean
  sourceLanguage?: DocumentLanguageMetadata | null
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const visiblePageRef = useRef<HTMLDivElement | null>(null)
  const activeTranslationControllerRef = useRef<AbortController | null>(null)
  const suppressTextSelectionMenuRef = useRef(false)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageAspectRatio, setPageAspectRatio] = useState<number | null>(null)
  const [pageNaturalWidth, setPageNaturalWidth] = useState<number | null>(null)
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>("fit-page")
  const [customZoomScale, setCustomZoomScale] = useState(1)
  const [isRendered, setIsRendered] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [translationPane, setTranslationPane] = useState<TranslationPaneState | null>(null)
  const [pageContextMenu, setPageContextMenu] = useState<{
    open: boolean
    point: PdfMenuPoint
  } | null>(null)
  const [textSelectionMenu, setTextSelectionMenu] = useState<TextSelectionMenuState | null>(null)
  const [visualSelectionMenu, setVisualSelectionMenu] = useState<VisualSelectionMenuState | null>(null)
  const [regionSelection, setRegionSelection] = useState<RegionSelection | null>(null)
  const [isRegionSelectionMode, setIsRegionSelectionMode] = useState(false)
  const [isTranslationPending, setIsTranslationPending] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return

      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setPageNumber(1)
    setNumPages(null)
    setPageAspectRatio(null)
    setPageNaturalWidth(null)
    setLoadError(false)
    setIsRendered(false)
    setTranslationPane(null)
    setPageContextMenu(null)
    setTextSelectionMenu(null)
    setVisualSelectionMenu(null)
    setRegionSelection(null)
    setIsRegionSelectionMode(false)
  }, [src])

  useEffect(() => {
    if (!translationsDisabled) return

    setTextSelectionMenu(null)
    setVisualSelectionMenu(null)
    setRegionSelection(null)
    setIsRegionSelectionMode(false)
  }, [translationsDisabled])

  useEffect(
    () => () => {
      activeTranslationControllerRef.current?.abort()
    },
    []
  )

  const pageViewportWidth = Math.max(viewportSize.width - previewPadding * 2, 0)
  const pageViewportHeight = Math.max(viewportSize.height - toolbarHeight - previewPadding * 2, 0)
  const fitPageWidth = pageAspectRatio
    ? Math.min(pageViewportWidth, pageViewportHeight * pageAspectRatio)
    : pageViewportWidth
  const basePageWidth = Math.max(fitPageWidth, 240)
  const pageWidth = Math.max(
    zoomMode === "fit-width"
      ? pageViewportWidth
      : zoomMode === "custom"
        ? basePageWidth * customZoomScale
        : fitPageWidth,
    240
  )
  const zoomPercent = pageNaturalWidth
    ? Math.round((pageWidth / pageNaturalWidth) * 100)
    : Math.round((pageWidth / basePageWidth) * 100)
  const canZoomOut = pageWidth / basePageWidth > minZoom
  const canZoomIn = pageWidth / basePageWidth < maxZoom
  const hasPreviousPage = pageNumber > 1
  const hasNextPage = numPages !== null && pageNumber < numPages
  const isReady = isRendered && !loadError
  const availableTranslationLanguages = useMemo(
    () => getTranslationTargetLanguages(sourceLanguage),
    [sourceLanguage]
  )

  function handleDocumentLoadSuccess(pdf: PDFDocumentProxy) {
    setNumPages(pdf.numPages)
    setPageNumber((current) => Math.min(current, pdf.numPages))
    setLoadError(false)
  }

  function handlePageLoadSuccess(page: PDFPageProxy) {
    const viewport = page.getViewport({ scale: 1 })
    setPageAspectRatio(viewport.width / viewport.height)
    setPageNaturalWidth(viewport.width)
  }

  function updateCustomZoom(nextScale: number) {
    setZoomMode("custom")
    setCustomZoomScale(clampZoom(nextScale))
    setIsRendered(false)
    setVisualSelectionMenu(null)
    setRegionSelection(null)
  }

  function requestPage(nextPageNumber: number) {
    if (nextPageNumber === pageNumber) return

    setIsRendered(false)
    setTextSelectionMenu(null)
    setVisualSelectionMenu(null)
    setRegionSelection(null)
    setIsRegionSelectionMode(false)
    setPageNumber(nextPageNumber)
  }

  function toggleRegionSelectionMode() {
    const nextMode = !isRegionSelectionMode

    setIsRegionSelectionMode(nextMode)
    setPageContextMenu(null)
    setTextSelectionMenu(null)
    setVisualSelectionMenu(null)

    if (nextMode) {
      window.getSelection()?.removeAllRanges()
    } else {
      setRegionSelection(null)
    }
  }

  function printPdf() {
    const frame = window.document.createElement("iframe")
    frame.style.position = "fixed"
    frame.style.right = "0"
    frame.style.bottom = "0"
    frame.style.width = "0"
    frame.style.height = "0"
    frame.style.border = "0"
    frame.src = src
    frame.onload = () => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    }
    window.document.body.appendChild(frame)
    window.setTimeout(() => frame.remove(), 60_000)
  }

  function cancelTranslation() {
    activeTranslationControllerRef.current?.abort()
  }

  function closeTranslationPane() {
    if (translationPane?.status === "loading") {
      cancelTranslation()
    }

    setTranslationPane(null)
  }

  function createTranslationController() {
    activeTranslationControllerRef.current?.abort()
    const controller = new AbortController()
    activeTranslationControllerRef.current = controller
    setIsTranslationPending(true)
    return controller
  }

  function finishTranslation(controller: AbortController) {
    if (activeTranslationControllerRef.current === controller) {
      activeTranslationControllerRef.current = null
      setIsTranslationPending(false)
    }
  }

  function getCurrentCanvas() {
    return getRenderedPdfCanvas(visiblePageRef.current)
  }

  async function runPageTranslation(targetLanguage: DocumentTranslationLanguage) {
    if (translationsDisabled) return

    const controller = createTranslationController()
    const pendingState: TranslationPaneState = {
      status: "loading",
      targetLanguage,
      sourceType: "page-image",
      pageNumber,
      text: "",
      error: null,
      provider: null,
      model: null,
    }
    setTranslationPane(pendingState)
    setPageContextMenu(null)

    try {
      const canvas = getCurrentCanvas()
      if (canvas === null) {
        throw new Error("The rendered PDF page is not ready yet.")
      }

      const imageBase64 = captureCanvasRegionAsPngBase64({ canvas })
      const response = await translateDocument({
        vaultId,
        documentId,
        targetLanguage,
        source: {
          type: "page-image",
          pageNumber,
          imageBase64,
          mimeType: "image/png",
        },
        signal: controller.signal,
      })

      setTranslationPane((current) =>
        controller.signal.aborted && current === null
          ? null
          : {
              ...pendingState,
              status: "success",
              text: response.translation.text,
              provider: response.translation.provider,
              model: response.translation.model,
            }
      )
    } catch (error) {
      setTranslationPane((current) =>
        controller.signal.aborted && current === null
          ? null
          : {
              ...pendingState,
              status: "error",
              error: getAbortAwareError(error),
            }
      )
    } finally {
      finishTranslation(controller)
    }
  }

  async function runSelectionTranslation({
    targetLanguage,
    source,
  }: {
    targetLanguage: DocumentTranslationLanguage
    source: Extract<DocumentTranslationSource, { type: "text" | "area-image" }>
  }) {
    if (translationsDisabled) return

    const controller = createTranslationController()
    const pendingState: TranslationPaneState = {
      status: "loading",
      targetLanguage,
      sourceType: source.type,
      pageNumber: source.pageNumber ?? pageNumber,
      text: "",
      error: null,
      provider: null,
      model: null,
    }
    setTranslationPane(pendingState)
    setTextSelectionMenu(null)
    setVisualSelectionMenu(null)

    try {
      const response = await translateDocument({
        vaultId,
        documentId,
        targetLanguage,
        source,
        signal: controller.signal,
      })

      setTranslationPane((current) =>
        controller.signal.aborted && current === null
          ? null
          : {
              ...pendingState,
              status: "success",
              text: response.translation.text,
              provider: response.translation.provider,
              model: response.translation.model,
            }
      )
    } catch (error) {
      setTranslationPane((current) =>
        controller.signal.aborted && current === null
          ? null
          : {
              ...pendingState,
              status: "error",
              error: getAbortAwareError(error),
            }
      )
    } finally {
      finishTranslation(controller)
    }
  }

  async function runVisualSelectionTranslation(
    targetLanguage: DocumentTranslationLanguage,
    selection: RegionSelection,
    selectionPageNumber: number
  ) {
    if (translationsDisabled) return

    const canvas = getCurrentCanvas()

    if (canvas === null) {
      setTranslationPane({
        status: "error",
        targetLanguage,
        sourceType: "area-image",
        pageNumber: selectionPageNumber,
        text: "",
        error: "The rendered PDF page is not ready yet.",
        provider: null,
        model: null,
      })
      setVisualSelectionMenu(null)
      return
    }

    const rect = getNormalizedCanvasRect(selection, canvas)
    const imageBase64 = captureCanvasRegionAsPngBase64({ canvas, rect })
    await runSelectionTranslation({
      targetLanguage,
      source: {
        type: "area-image",
        pageNumber: selectionPageNumber,
        imageBase64,
        mimeType: "image/png",
        rect,
      },
    })
  }

  function handlePageContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (!isReady || translationsDisabled) return

    event.preventDefault()
    setTextSelectionMenu(null)
    setVisualSelectionMenu(null)
    setPageContextMenu({
      open: true,
      point: { x: event.clientX, y: event.clientY },
    })
  }

  function handlePageMouseUp(event: MouseEvent<HTMLDivElement>) {
    if (suppressTextSelectionMenuRef.current) {
      suppressTextSelectionMenuRef.current = false
      return
    }

    if (!isReady || translationsDisabled) return

    window.setTimeout(() => {
      const text = getSelectionTextWithin(visiblePageRef.current)
      if (text === null) return

      setPageContextMenu(null)
      setVisualSelectionMenu(null)
      setTextSelectionMenu({
        open: true,
        point: { x: event.clientX, y: event.clientY },
        text,
        pageNumber,
      })
    }, 0)
  }

  function handleRegionSelectionInteractionStart() {
    suppressTextSelectionMenuRef.current = true
    window.getSelection()?.removeAllRanges()
    setTextSelectionMenu(null)
    setPageContextMenu(null)
    setVisualSelectionMenu(null)
  }

  function handleRegionSelectionChange(selection: RegionSelection | null) {
    setRegionSelection(selection)

    if (selection === null) {
      setVisualSelectionMenu(null)
    }
  }

  function handleRegionSelectionComplete(_selection: RegionSelection, point: PdfMenuPoint) {
    setVisualSelectionMenu({
      open: true,
      point,
      pageNumber,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden xl:flex-row">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">
        <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-background px-3 py-2 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Previous PDF page"
              disabled={!hasPreviousPage}
              onClick={() => requestPage(Math.max(pageNumber - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="w-28 text-center text-sm font-medium tabular-nums">
              Page {pageNumber} <span className="text-muted-foreground">of {numPages ?? "..."}</span>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Next PDF page"
              disabled={!hasNextPage}
              onClick={() => requestPage(Math.min(pageNumber + 1, numPages ?? pageNumber))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="col-start-1 row-start-2 flex min-w-0 items-center gap-2 xl:col-start-2 xl:row-start-1 xl:justify-self-center">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Zoom out"
              disabled={!canZoomOut}
              onClick={() => updateCustomZoom(pageWidth / basePageWidth - zoomStep)}
            >
              <ZoomOut className="size-4" />
            </Button>
            <div className="min-w-14 text-center text-sm font-medium">{zoomPercent}%</div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Zoom in"
              disabled={!canZoomIn}
              onClick={() => updateCustomZoom(pageWidth / basePageWidth + zoomStep)}
            >
              <ZoomIn className="size-4" />
            </Button>
            <div className="hidden rounded-md border p-0.5 md:flex">
              <Button
                type="button"
                size="sm"
                variant={zoomMode === "fit-page" ? "secondary" : "ghost"}
                onClick={() => {
                  setZoomMode("fit-page")
                  setIsRendered(false)
                  setVisualSelectionMenu(null)
                  setRegionSelection(null)
                }}
              >
                Fit page
              </Button>
              <Button
                type="button"
                size="sm"
                variant={zoomMode === "fit-width" ? "secondary" : "ghost"}
                onClick={() => {
                  setZoomMode("fit-width")
                  setIsRendered(false)
                  setVisualSelectionMenu(null)
                  setRegionSelection(null)
                }}
              >
                Fit width
              </Button>
            </div>
          </div>

          <div className="col-start-2 row-start-1 flex items-center gap-2 justify-self-end xl:col-start-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant={isRegionSelectionMode ? "secondary" : "outline"}
                  aria-label={isRegionSelectionMode ? "Disable region selection" : "Select PDF region"}
                  aria-pressed={isRegionSelectionMode}
                  disabled={translationsDisabled || (!isReady && !isRegionSelectionMode)}
                  onClick={toggleRegionSelectionMode}
                >
                  <SquareDashedMousePointer className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isRegionSelectionMode ? "Disable region selection" : "Select PDF region"}</TooltipContent>
            </Tooltip>
            <Button type="button" size="icon" variant="outline" aria-label="Print" onClick={printPdf}>
              <Printer className="size-4" />
            </Button>
            <Button asChild size="icon" variant="outline">
              <a href={downloadUrl} aria-label="Download">
                <Download className="size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto">
        {loadError ? (
          <div className="flex h-full min-h-96 items-center justify-center p-8 text-center">
            <div>
              <h2 className="text-base font-semibold">PDF preview unavailable</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Arkivra could not render this PDF in the viewer. Download the file to inspect it.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-full justify-center p-4 md:p-8">
            <div
              ref={visiblePageRef}
              className={cn("relative", !isRendered && "opacity-60")}
              onContextMenu={handlePageContextMenu}
              onMouseUp={handlePageMouseUp}
            >
              <PdfDocument
                file={src}
                loading={<div className="p-8 text-sm text-muted-foreground">Loading PDF...</div>}
                error={<div className="p-8 text-sm text-destructive">Unable to load PDF.</div>}
                onLoadSuccess={handleDocumentLoadSuccess}
                onLoadError={() => setLoadError(true)}
              >
                <PdfPage
                  key={`${src}-${pageNumber}-${Math.round(pageWidth)}`}
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderAnnotationLayer={false}
                  renderTextLayer
                  loading={<div className="p-8 text-sm text-muted-foreground">Loading page...</div>}
                  onLoadSuccess={handlePageLoadSuccess}
                  onRenderSuccess={() => setIsRendered(true)}
                  onRenderError={() => setLoadError(true)}
                />
              </PdfDocument>
              <PdfRegionSelectionOverlay
                enabled={isReady && !translationsDisabled && isRegionSelectionMode}
                selection={regionSelection}
                onInteractionStart={handleRegionSelectionInteractionStart}
                onSelectionChange={handleRegionSelectionChange}
                onSelectionComplete={handleRegionSelectionComplete}
              />
              <span className="sr-only">{documentName}</span>
            </div>
          </div>
        )}
        </div>
      </div>
      {translationPane !== null && !translationsDisabled ? (
        <PdfTranslationPane
          translationPane={translationPane}
          onCancel={cancelTranslation}
          onClose={closeTranslationPane}
        />
      ) : null}
      <PdfTranslationMenus
        availableTranslationLanguages={availableTranslationLanguages}
        isTranslationPending={isTranslationPending}
        pageContextMenu={pageContextMenu}
        textSelectionMenu={textSelectionMenu}
        translationsDisabled={translationsDisabled}
        visualSelectionMenu={visualSelectionMenu}
        onPageMenuOpenChange={(open) =>
          setPageContextMenu((current) => (current === null ? null : { ...current, open }))
        }
        onTextMenuOpenChange={(open) =>
          setTextSelectionMenu((current) => (current === null ? null : { ...current, open }))
        }
        onTranslatePage={(language) => {
          void runPageTranslation(language)
        }}
        onTranslateTextSelection={(language, menu) => {
          void runSelectionTranslation({
            targetLanguage: language,
            source: {
              type: "text",
              pageNumber: menu.pageNumber,
              text: menu.text,
            },
          })
        }}
        onTranslateVisualSelection={(language, menu) => {
          if (regionSelection !== null) {
            void runVisualSelectionTranslation(language, regionSelection, menu.pageNumber)
          }
        }}
        onVisualMenuOpenChange={(open) =>
          setVisualSelectionMenu((current) => (current === null ? null : { ...current, open }))
        }
      />
    </div>
  )
}

function PdfTranslationPane({
  translationPane,
  onCancel,
  onClose,
}: {
  translationPane: TranslationPaneState
  onCancel: () => void
  onClose: () => void
}) {
  return (
    <aside className="flex h-80 min-h-0 shrink-0 flex-col overflow-hidden rounded-md border bg-background xl:h-full xl:w-88">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">
            {getTranslationSourceLabel(translationPane.sourceType)} translation
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            Page {translationPane.pageNumber} to {getTranslationLanguageLabel(translationPane.targetLanguage)}
          </p>
        </div>
        <Button type="button" size="icon" variant="ghost" aria-label="Close translation pane" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {translationPane.status === "loading" ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Translating {getTranslationSourceLabel(translationPane.sourceType).toLowerCase()}...
            </p>
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : translationPane.status === "error" ? (
          <p className="whitespace-pre-wrap break-words text-sm text-destructive">
            {translationPane.error ?? "Translation failed."}
          </p>
        ) : (
          <div className="text-sm leading-6">
            <p className="whitespace-pre-wrap break-words">{translationPane.text}</p>
            {translationPane.provider !== null ? (
              <p className="mt-4 text-xs text-muted-foreground">
                {translationPane.provider} - {translationPane.model}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  )
}

function PdfTranslationMenus({
  availableTranslationLanguages,
  isTranslationPending,
  pageContextMenu,
  textSelectionMenu,
  translationsDisabled,
  visualSelectionMenu,
  onPageMenuOpenChange,
  onTextMenuOpenChange,
  onTranslatePage,
  onTranslateTextSelection,
  onTranslateVisualSelection,
  onVisualMenuOpenChange,
}: {
  availableTranslationLanguages: Array<{ value: DocumentTranslationLanguage; label: string }>
  isTranslationPending: boolean
  pageContextMenu: { open: boolean; point: PdfMenuPoint } | null
  textSelectionMenu: TextSelectionMenuState | null
  translationsDisabled: boolean
  visualSelectionMenu: VisualSelectionMenuState | null
  onPageMenuOpenChange: (open: boolean) => void
  onTextMenuOpenChange: (open: boolean) => void
  onTranslatePage: (language: DocumentTranslationLanguage) => void
  onTranslateTextSelection: (language: DocumentTranslationLanguage, menu: TextSelectionMenuState) => void
  onTranslateVisualSelection: (language: DocumentTranslationLanguage, menu: VisualSelectionMenuState) => void
  onVisualMenuOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <TranslationMenu
        open={!translationsDisabled && (pageContextMenu?.open ?? false)}
        point={pageContextMenu?.point}
        label="Translate Page"
        disabled={isTranslationPending}
        languages={availableTranslationLanguages}
        onOpenChange={onPageMenuOpenChange}
        onSelect={(language) => onTranslatePage(language)}
      />
      <TranslationMenu
        open={!translationsDisabled && (textSelectionMenu?.open ?? false)}
        point={textSelectionMenu?.point}
        label="Translate Selection"
        disabled={isTranslationPending || textSelectionMenu === null}
        languages={availableTranslationLanguages}
        onOpenChange={onTextMenuOpenChange}
        onSelect={(language) => {
          if (textSelectionMenu !== null) {
            onTranslateTextSelection(language, textSelectionMenu)
          }
        }}
      />
      <TranslationMenu
        open={!translationsDisabled && (visualSelectionMenu?.open ?? false)}
        point={visualSelectionMenu?.point}
        label="Translate Selection"
        disabled={isTranslationPending || visualSelectionMenu === null}
        languages={availableTranslationLanguages}
        onOpenChange={onVisualMenuOpenChange}
        onSelect={(language) => {
          if (visualSelectionMenu !== null) {
            onTranslateVisualSelection(language, visualSelectionMenu)
          }
        }}
      />
    </>
  )
}

function TranslationMenu({
  disabled,
  label,
  languages,
  open,
  point,
  onOpenChange,
  onSelect,
}: {
  disabled: boolean
  label: string
  languages: Array<{ value: DocumentTranslationLanguage; label: string }>
  open: boolean
  point: PdfMenuPoint | undefined
  onOpenChange: (open: boolean) => void
  onSelect: (language: DocumentTranslationLanguage) => void
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          className="fixed z-50 size-px opacity-0"
          style={{ left: point?.x ?? 0, top: point?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages className="size-4" />
            <span>{label}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {languages.map((language) => (
              <DropdownMenuItem
                key={language.value}
                disabled={disabled}
                onSelect={() => onSelect(language.value)}
              >
                {language.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
