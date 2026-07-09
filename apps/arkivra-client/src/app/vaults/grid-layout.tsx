import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"

const GRID_GAP = 16
const MIN_CARD_WIDTH = 275
const PREFERRED_CARD_WIDTH = 275
const MAX_CARD_WIDTH = 300

function getGridCardWidth(containerWidth: number) {
  if (containerWidth <= 0) return PREFERRED_CARD_WIDTH
  if (containerWidth < MIN_CARD_WIDTH) return containerWidth

  const columns = Math.max(
    1,
    Math.floor((containerWidth + GRID_GAP) / (PREFERRED_CARD_WIDTH + GRID_GAP))
  )
  const availableWidth = containerWidth - GRID_GAP * (columns - 1)
  const expandedWidth = availableWidth / columns

  return Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, expandedWidth))
}

export function ResponsiveVaultGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const cardWidth = getGridCardWidth(containerWidth)
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardWidth}px), ${cardWidth}px))`,
  }

  useEffect(() => {
    const gridElement = gridRef.current
    if (!gridElement) return

    const updateWidth = () => setContainerWidth(gridElement.clientWidth)
    updateWidth()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth)
      return () => window.removeEventListener("resize", updateWidth)
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      setContainerWidth(entry?.contentRect.width ?? gridElement.clientWidth)
    })

    resizeObserver.observe(gridElement)
    return () => resizeObserver.disconnect()
  }, [])

  return (
    <div
      ref={gridRef}
      className={["grid justify-start gap-4", className].filter(Boolean).join(" ")}
      style={gridStyle}
    >
      {children}
    </div>
  )
}
