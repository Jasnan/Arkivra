import { FileText } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

export type DocumentFileIcon = ComponentType<SVGProps<SVGSVGElement>>

const imageFileExtensions = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
])

const wordFileExtensions = new Set(["doc", "docx", "odt", "rtf"])
const spreadsheetFileExtensions = new Set(["csv", "ods", "xls", "xlsx"])
const presentationFileExtensions = new Set(["odp", "ppt", "pptx"])

function CustomFileIcon({
  children,
  strokeWidth = 2,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      {children}
    </svg>
  )
}

function PdfFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <CustomFileIcon {...props}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
      <path d="M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6" />
      <path d="M17 18h2" />
      <path d="M20 15h-3v6" />
      <path d="M11 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1" />
    </CustomFileIcon>
  )
}

function WordFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <CustomFileIcon {...props}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      <path d="M9 12l1.333 5l1.667 -4l1.667 4l1.333 -5" />
    </CustomFileIcon>
  )
}

function SpreadsheetFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <CustomFileIcon {...props}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      <path d="M8 12h8" />
      <path d="M8 16h8" />
      <path d="M11 12v6" />
      <path d="M15 12v6" />
      <path d="M8 18h8" />
    </CustomFileIcon>
  )
}

function PresentationFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <CustomFileIcon {...props}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      <path d="M9 12h4.5a2 2 0 0 1 0 4h-4.5v-4" />
      <path d="M9 16v3" />
    </CustomFileIcon>
  )
}

function ImageFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <CustomFileIcon {...props}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      <path d="M8 16l2 -2l2 2l3 -3l2 2" />
      <path d="M9 11h.01" />
    </CustomFileIcon>
  )
}

function getFileExtension(name?: string | null) {
  if (!name) {
    return ""
  }

  const trimmedName = name.trim().toLowerCase()
  const extension = trimmedName.split(".").pop()
  return extension && extension !== trimmedName ? extension : ""
}

export function getDocumentFileIcon({
  mimeType,
  name,
  originalName,
}: {
  mimeType?: string | null
  name?: string | null
  originalName?: string | null
}): DocumentFileIcon {
  const normalizedMimeType = mimeType?.toLowerCase() ?? ""
  const fileExtensions = [getFileExtension(name), getFileExtension(originalName)]

  if (normalizedMimeType === "application/pdf" || fileExtensions.includes("pdf")) {
    return PdfFileIcon
  }

  if (
    normalizedMimeType.startsWith("image/") ||
    fileExtensions.some((extension) => imageFileExtensions.has(extension))
  ) {
    return ImageFileIcon
  }

  if (
    normalizedMimeType.includes("word") ||
    normalizedMimeType.includes("opendocument.text") ||
    normalizedMimeType.includes("officedocument.wordprocessingml") ||
    fileExtensions.some((extension) => wordFileExtensions.has(extension))
  ) {
    return WordFileIcon
  }

  if (
    normalizedMimeType.includes("spreadsheet") ||
    normalizedMimeType.includes("excel") ||
    normalizedMimeType.includes("csv") ||
    fileExtensions.some((extension) => spreadsheetFileExtensions.has(extension))
  ) {
    return SpreadsheetFileIcon
  }

  if (
    normalizedMimeType.includes("powerpoint") ||
    normalizedMimeType.includes("presentation") ||
    fileExtensions.some((extension) => presentationFileExtensions.has(extension))
  ) {
    return PresentationFileIcon
  }

  return FileText
}
