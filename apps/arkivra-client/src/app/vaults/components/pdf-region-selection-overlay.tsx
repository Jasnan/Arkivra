"use client"

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react"
import { Rnd } from "react-rnd"

import { cn } from "@/lib/utils"

export interface RegionSelection {
  x: number
  y: number
  width: number
  height: number
}

interface SelectionPoint {
  x: number
  y: number
}

interface SelectionSize {
  width: number
  height: number
}

interface RegionCreationState {
  pointerId: number
  start: SelectionPoint
}

const minimumSelectionSize = 12

const cornerHandleStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 9999,
  background: "var(--background)",
  border: "1px solid rgb(37 99 235 / 0.9)",
}

const horizontalHandleStyle: CSSProperties = {
  height: 6,
  borderRadius: 9999,
  background: "rgb(59 130 246 / 0.65)",
}

const verticalHandleStyle: CSSProperties = {
  width: 6,
  borderRadius: 9999,
  background: "rgb(59 130 246 / 0.65)",
}

const resizeHandleStyles = {
  top: { ...horizontalHandleStyle, top: -3, left: 14, right: 14 },
  right: { ...verticalHandleStyle, top: 14, right: -3, bottom: 14 },
  bottom: { ...horizontalHandleStyle, bottom: -3, left: 14, right: 14 },
  left: { ...verticalHandleStyle, top: 14, left: -3, bottom: 14 },
  topRight: { ...cornerHandleStyle, top: -5, right: -5 },
  bottomRight: { ...cornerHandleStyle, right: -5, bottom: -5 },
  bottomLeft: { ...cornerHandleStyle, bottom: -5, left: -5 },
  topLeft: { ...cornerHandleStyle, top: -5, left: -5 },
} satisfies Record<string, CSSProperties>

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampPoint(point: SelectionPoint, bounds: SelectionSize): SelectionPoint {
  return {
    x: clamp(point.x, 0, bounds.width),
    y: clamp(point.y, 0, bounds.height),
  }
}

function clampSelection(selection: RegionSelection, bounds: SelectionSize): RegionSelection {
  const width = clamp(selection.width, 0, bounds.width)
  const height = clamp(selection.height, 0, bounds.height)

  return {
    x: clamp(selection.x, 0, Math.max(bounds.width - width, 0)),
    y: clamp(selection.y, 0, Math.max(bounds.height - height, 0)),
    width,
    height,
  }
}

function createSelection(start: SelectionPoint, end: SelectionPoint, bounds: SelectionSize): RegionSelection {
  const clampedStart = clampPoint(start, bounds)
  const clampedEnd = clampPoint(end, bounds)
  const x = Math.min(clampedStart.x, clampedEnd.x)
  const y = Math.min(clampedStart.y, clampedEnd.y)

  return {
    x,
    y,
    width: Math.abs(clampedEnd.x - clampedStart.x),
    height: Math.abs(clampedEnd.y - clampedStart.y),
  }
}

function hasMeaningfulSize(selection: RegionSelection) {
  return selection.width >= minimumSelectionSize && selection.height >= minimumSelectionSize
}

function getPointFromEvent(event: PointerEvent<HTMLElement>, element: HTMLElement): SelectionPoint {
  const bounds = element.getBoundingClientRect()

  return clampPoint(
    {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    },
    bounds
  )
}

function getMenuPoint(selection: RegionSelection, element: HTMLElement): SelectionPoint {
  const bounds = element.getBoundingClientRect()

  return {
    x: bounds.left + selection.x + selection.width,
    y: bounds.top + selection.y + selection.height,
  }
}

function getElementSize(element: HTMLElement): SelectionSize {
  const bounds = element.getBoundingClientRect()

  return {
    width: bounds.width,
    height: bounds.height,
  }
}

function isSameSelection(a: RegionSelection | null, b: RegionSelection | null) {
  if (a === null || b === null) {
    return a === b
  }

  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function PdfRegionSelectionOverlay({
  enabled,
  selection,
  onInteractionStart,
  onSelectionChange,
  onSelectionComplete,
}: {
  enabled: boolean
  selection: RegionSelection | null
  onInteractionStart: () => void
  onSelectionChange: (selection: RegionSelection | null) => void
  onSelectionComplete: (selection: RegionSelection, point: SelectionPoint) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selectionRef = useRef<RegionSelection | null>(selection)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const previousSizeRef = useRef<SelectionSize | null>(null)
  const [creation, setCreation] = useState<RegionCreationState | null>(null)

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  useEffect(() => {
    const root = rootRef.current
    if (root === null) return undefined

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return

      const nextSize = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }
      const previousSize = previousSizeRef.current
      previousSizeRef.current = nextSize

      const currentSelection = selectionRef.current
      if (
        currentSelection === null ||
        previousSize === null ||
        previousSize.width <= 0 ||
        previousSize.height <= 0 ||
        nextSize.width <= 0 ||
        nextSize.height <= 0
      ) {
        return
      }

      const scaledSelection = clampSelection(
        {
          x: currentSelection.x * (nextSize.width / previousSize.width),
          y: currentSelection.y * (nextSize.height / previousSize.height),
          width: currentSelection.width * (nextSize.width / previousSize.width),
          height: currentSelection.height * (nextSize.height / previousSize.height),
        },
        nextSize
      )

      if (!isSameSelection(currentSelection, scaledSelection)) {
        onSelectionChangeRef.current(scaledSelection)
      }
    })

    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  function updateSelection(nextSelection: RegionSelection | null) {
    selectionRef.current = nextSelection
    onSelectionChange(nextSelection)
  }

  function finishSelection(nextSelection: RegionSelection) {
    const root = rootRef.current
    if (root === null) return

    const boundedSelection = clampSelection(nextSelection, getElementSize(root))
    updateSelection(boundedSelection)
    onSelectionComplete(boundedSelection, getMenuPoint(boundedSelection, root))
  }

  function handleCreatePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || event.button !== 0 || rootRef.current === null) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onInteractionStart()

    const start = getPointFromEvent(event, rootRef.current)
    setCreation({ pointerId: event.pointerId, start })
    updateSelection({ x: start.x, y: start.y, width: 0, height: 0 })
  }

  function handleCreatePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (creation === null || creation.pointerId !== event.pointerId || rootRef.current === null) {
      return
    }

    event.preventDefault()
    updateSelection(
      createSelection(creation.start, getPointFromEvent(event, rootRef.current), getElementSize(rootRef.current))
    )
  }

  function handleCreatePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (creation === null || creation.pointerId !== event.pointerId || rootRef.current === null) {
      return
    }

    event.preventDefault()
    event.currentTarget.releasePointerCapture(event.pointerId)

    const nextSelection = createSelection(
      creation.start,
      getPointFromEvent(event, rootRef.current),
      getElementSize(rootRef.current)
    )
    setCreation(null)

    if (!hasMeaningfulSize(nextSelection)) {
      updateSelection(null)
      return
    }

    finishSelection(nextSelection)
  }

  function handleCreatePointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (creation === null || creation.pointerId !== event.pointerId) return

    setCreation(null)
    updateSelection(null)
  }

  if (!enabled) {
    return null
  }

  const isCreating = creation !== null

  return (
    <div ref={rootRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div
        className="pointer-events-auto absolute inset-0 cursor-crosshair select-none"
        style={{ zIndex: 20, touchAction: "none" }}
        onPointerDown={handleCreatePointerDown}
        onPointerMove={handleCreatePointerMove}
        onPointerUp={handleCreatePointerUp}
        onPointerCancel={handleCreatePointerCancel}
      />
      {selection !== null ? (
        <Rnd
          bounds="parent"
          className={cn(
            "pointer-events-auto rounded-md border border-blue-500/80 bg-blue-500/15",
            isCreating ? "cursor-crosshair" : "cursor-move"
          )}
          style={{ zIndex: 30 }}
          position={{ x: selection.x, y: selection.y }}
          size={{
            width: Math.max(selection.width, isCreating ? 1 : minimumSelectionSize),
            height: Math.max(selection.height, isCreating ? 1 : minimumSelectionSize),
          }}
          minWidth={minimumSelectionSize}
          minHeight={minimumSelectionSize}
          resizeHandleStyles={resizeHandleStyles}
          disableDragging={isCreating}
          enableResizing={!isCreating}
          onDragStart={() => {
            onInteractionStart()
          }}
          onDrag={(_, data) => {
            if (rootRef.current === null) return

            updateSelection(
              clampSelection(
                {
                  ...selection,
                  x: data.x,
                  y: data.y,
                },
                getElementSize(rootRef.current)
              )
            )
          }}
          onDragStop={(_, data) => {
            if (rootRef.current === null) return

            finishSelection(
              clampSelection(
                {
                  ...selection,
                  x: data.x,
                  y: data.y,
                },
                getElementSize(rootRef.current)
              )
            )
          }}
          onResizeStart={() => {
            onInteractionStart()
          }}
          onResize={(_, __, elementRef, ___, position) => {
            if (rootRef.current === null) return

            updateSelection(
              clampSelection(
                {
                  x: position.x,
                  y: position.y,
                  width: elementRef.offsetWidth,
                  height: elementRef.offsetHeight,
                },
                getElementSize(rootRef.current)
              )
            )
          }}
          onResizeStop={(_, __, elementRef, ___, position) => {
            if (rootRef.current === null) return

            finishSelection(
              clampSelection(
                {
                  x: position.x,
                  y: position.y,
                  width: elementRef.offsetWidth,
                  height: elementRef.offsetHeight,
                },
                getElementSize(rootRef.current)
              )
            )
          }}
        />
      ) : null}
    </div>
  )
}
