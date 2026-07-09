"use client"

import { type ImgHTMLAttributes, type ReactNode } from "react"
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react"
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ImagePreviewFrameProps {
  src: string
  alt: string
  toolbarActions?: ReactNode
  children?: ReactNode
  className?: string
  contentClassName?: string
  imageClassName?: string
  imageProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src" | "className">
}

export function ImagePreviewFrame({
  src,
  alt,
  toolbarActions,
  children,
  className,
  contentClassName,
  imageClassName,
  imageProps,
}: ImagePreviewFrameProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-muted/20",
        className
      )}
    >
      <TransformWrapper
        key={src}
        initialScale={1}
        minScale={0.2}
        maxScale={8}
        centerOnInit
        centerZoomedOut
        wheel={{ step: 0.08 }}
        doubleClick={{ mode: "zoomIn" }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b bg-background/95 px-3 py-2">
              <Button type="button" size="sm" variant="outline" onClick={() => zoomOut()}>
                <ZoomOut className="size-4" />
                Zoom out
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => zoomIn()}>
                <ZoomIn className="size-4" />
                Zoom in
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => resetTransform()}>
                <RotateCcw className="size-4" />
                Reset
              </Button>
              {toolbarActions}
            </div>
            <div className="min-h-0 flex-1 p-4 md:p-8">
              <TransformComponent
                wrapperStyle={{
                  width: "100%",
                  height: "100%",
                }}
                contentStyle={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div className={cn("relative inline-flex max-h-full max-w-full", contentClassName)}>
                  <img
                    {...imageProps}
                    src={src}
                    alt={alt}
                    draggable={imageProps?.draggable ?? false}
                    className={cn(
                      "max-h-full max-w-full select-none object-contain",
                      imageClassName
                    )}
                  />
                  {children}
                </div>
              </TransformComponent>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  )
}
