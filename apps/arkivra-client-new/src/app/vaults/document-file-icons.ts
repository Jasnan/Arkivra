import { FileImage, FileText, FileType, type LucideIcon } from "lucide-react"

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
}): LucideIcon {
  const normalizedMimeType = mimeType?.toLowerCase() ?? ""
  const fileExtensions = [getFileExtension(name), getFileExtension(originalName)]

  if (
    normalizedMimeType.startsWith("image/") ||
    fileExtensions.some((extension) => imageFileExtensions.has(extension))
  ) {
    return FileImage
  }

  if (normalizedMimeType === "application/pdf" || fileExtensions.includes("pdf")) {
    return FileType
  }

  return FileText
}
