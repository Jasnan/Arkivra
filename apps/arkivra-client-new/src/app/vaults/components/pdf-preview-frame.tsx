"use client"

import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"
import { ChevronLeft, ChevronRight, Download, Printer, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

type PdfZoomMode = "fit-page" | "fit-width" | "custom"

const previewPadding = 32
const toolbarHeight = 56
const minZoom = 0.5
const maxZoom = 3
const zoomStep = 0.1

function clampZoom(value: number) {
  return Math.min(Math.max(value, minZoom), maxZoom)
}

export function PdfPreviewFrame({
  src,
  documentName,
  downloadUrl,
}: {
  src: string
  documentName: string
  downloadUrl: string
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageAspectRatio, setPageAspectRatio] = useState<number | null>(null)
  const [pageNaturalWidth, setPageNaturalWidth] = useState<number | null>(null)
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>("fit-page")
  const [customZoomScale, setCustomZoomScale] = useState(1)
  const [isRendered, setIsRendered] = useState(false)
  const [loadError, setLoadError] = useState(false)

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
  }, [src])

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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-muted/20">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-background px-3 py-2 md:px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Previous PDF page"
            disabled={!hasPreviousPage}
            onClick={() => setPageNumber((current) => Math.max(current - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Next PDF page"
            disabled={!hasNextPage}
            onClick={() => setPageNumber((current) => Math.min(current + 1, numPages ?? current))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <div className="px-2 text-sm font-medium">
            Page {pageNumber} <span className="text-muted-foreground">of {numPages ?? "..."}</span>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
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
              onClick={() => setZoomMode("fit-page")}
            >
              Fit page
            </Button>
            <Button
              type="button"
              size="sm"
              variant={zoomMode === "fit-width" ? "secondary" : "ghost"}
              onClick={() => setZoomMode("fit-width")}
            >
              Fit width
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={printPdf}>
            <Printer className="size-4" />
            Print
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={downloadUrl}>
              <Download className="size-4" />
              Download
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
            <div className={cn("relative", !isRendered && "opacity-60")}>
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
                  renderAnnotationLayer
                  renderTextLayer
                  loading={<div className="p-8 text-sm text-muted-foreground">Loading page...</div>}
                  onLoadSuccess={handlePageLoadSuccess}
                  onRenderSuccess={() => setIsRendered(true)}
                  onRenderError={() => setLoadError(true)}
                />
              </PdfDocument>
              <span className="sr-only">{documentName}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
