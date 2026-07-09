export const PDF_TRANSLATION_CAPTURE_MAX_LONG_EDGE = 2400
const pngDataUrlPrefixPattern = /^data:image\/png;base64,/

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export function getCanvasCropRect({
  canvas,
  rect,
}: {
  canvas: Pick<HTMLCanvasElement, "width" | "height">
  rect?: NormalizedRect
}) {
  if (rect === undefined) {
    return {
      sx: 0,
      sy: 0,
      sw: canvas.width,
      sh: canvas.height,
    }
  }

  const sx = Math.round(rect.x * canvas.width)
  const sy = Math.round(rect.y * canvas.height)
  const maxWidth = Math.max(canvas.width - sx, 1)
  const maxHeight = Math.max(canvas.height - sy, 1)

  return {
    sx,
    sy,
    sw: Math.min(Math.max(Math.round(rect.width * canvas.width), 1), maxWidth),
    sh: Math.min(Math.max(Math.round(rect.height * canvas.height), 1), maxHeight),
  }
}

export function getScaledCaptureSize({
  width,
  height,
  maxLongEdge = PDF_TRANSLATION_CAPTURE_MAX_LONG_EDGE,
}: {
  width: number
  height: number
  maxLongEdge?: number
}) {
  const longEdge = Math.max(width, height)

  if (longEdge <= maxLongEdge) {
    return { width, height }
  }

  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(Math.round(width * scale), 1),
    height: Math.max(Math.round(height * scale), 1),
  }
}

export function stripPngDataUrl(value: string) {
  return value.replace(pngDataUrlPrefixPattern, "")
}

export function captureCanvasRegionAsPngBase64({
  canvas,
  rect,
}: {
  canvas: HTMLCanvasElement
  rect?: NormalizedRect
}) {
  const crop = getCanvasCropRect({ canvas, rect })
  const outputSize = getScaledCaptureSize({ width: crop.sw, height: crop.sh })
  const output = document.createElement("canvas")
  output.width = outputSize.width
  output.height = outputSize.height

  const context = output.getContext("2d")
  if (context === null) {
    throw new Error("Could not create image capture context.")
  }

  context.drawImage(
    canvas,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    outputSize.width,
    outputSize.height
  )

  return stripPngDataUrl(output.toDataURL("image/png"))
}
