import type {
  ChatGenerationMetrics,
  ChatMessage,
  ChatMessageMetadata,
  ChatStreamStatus,
  Citation,
} from "./chat.api"

export const NEW_CHAT_DRAFT_ID = "__new_chat_draft__"

const WINDOWS_NEWLINE_PATTERN = /\r\n/g
const TRAILING_LINE_WHITESPACE_PATTERN = /[ \t]+\n/g
const LEADING_LINE_WHITESPACE_PATTERN = /\n[ \t]+/g
const REPEATED_NEWLINE_PATTERN = /\n{3,}/g
const CITATION_MARKER_PATTERN = /\[(\d+)\]/g

export function normalizeChatDisplayContent(content: string) {
  return content
    .replace(WINDOWS_NEWLINE_PATTERN, "\n")
    .replace(TRAILING_LINE_WHITESPACE_PATTERN, "\n")
    .replace(LEADING_LINE_WHITESPACE_PATTERN, "\n")
    .replace(REPEATED_NEWLINE_PATTERN, "\n\n")
    .trim()
}

export function getMessageText(message: ChatMessage) {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim()
}

export function getMessageMetadata(message: ChatMessage): ChatMessageMetadata {
  return message.metadata ?? {}
}

export function getMessageCitations(message: ChatMessage): Citation[] {
  const citationsPart = message.parts.find(
    (part): part is { type: "data-citations"; data: Citation[] } =>
      part.type === "data-citations"
  )
  return citationsPart?.data ?? getMessageMetadata(message).citations ?? []
}

export function getMessageMetrics(message: ChatMessage): ChatGenerationMetrics | null {
  const metricsPart = message.parts.find(
    (part): part is { type: "data-metrics"; data: ChatGenerationMetrics } =>
      part.type === "data-metrics"
  )
  return metricsPart?.data ?? getMessageMetadata(message).generationMetrics ?? null
}

export function getMessageActiveStatus(message: ChatMessage): ChatStreamStatus | null {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index]
    if (
      part?.type === "data-status" &&
      typeof part.data === "object" &&
      part.data !== null &&
      "label" in part.data &&
      (part.data.label === "retrieval" ||
        part.data.label === "generation" ||
        part.data.label === "saving")
    ) {
      return part.data.label
    }
  }

  return null
}

export function getMessageGenerationStatus(message: ChatMessage) {
  return getMessageMetadata(message).generationStatus ?? null
}

export function getMessageGenerationError(message: ChatMessage) {
  return getMessageMetadata(message).generationError ?? null
}

export function hasPendingAssistantMessage(messages: ChatMessage[]) {
  return messages.some((message) => {
    if (message.role !== "assistant") return false
    const generationStatus = message.metadata?.generationStatus
    if (generationStatus === "completed" || generationStatus === "failed") return false
    if (generationStatus === "pending") return true
    return message.parts.some((part) => part.type === "data-status") && getMessageText(message).length === 0
  })
}

export function messageSignature(messages: ChatMessage[]) {
  return messages
    .map((message) =>
      [
        message.id,
        message.role,
        message.metadata?.generationStatus ?? "",
        message.parts
          .map((part) => {
            if (part.type === "text") return `text:${part.text}`
            if (part.type === "data-status") {
              const data = part.data as { label?: unknown }
              return `status:${typeof data.label === "string" ? data.label : ""}`
            }
            return part.type
          })
          .join(","),
      ].join("|")
    )
    .join("||")
}

export function pageRange(citation: Citation) {
  if (citation.pageStart === null && citation.pageEnd === null) return "Document"
  if (
    citation.pageStart !== null &&
    citation.pageEnd !== null &&
    citation.pageStart !== citation.pageEnd
  ) {
    return `Pages ${citation.pageStart}-${citation.pageEnd}`
  }
  return `Page ${citation.pageStart ?? citation.pageEnd}`
}

export function citationSectionLabel(citation: Citation) {
  const sectionPath =
    citation.sectionPath?.map((section) => section.trim()).filter((section) => section.length > 0) ?? []
  if (sectionPath.length > 0) return sectionPath.join(" > ")
  return citation.section
}

export function projectInlineCitationsForDisplay({
  content,
  citations,
}: {
  content: string
  citations: Citation[]
}) {
  if (content.length === 0 || citations.length === 0) {
    return { content, citations: [] }
  }

  const remappedCitationNumbers = new Map<number, number>()
  const displayCitations: Citation[] = []
  const displayContent = content.replace(CITATION_MARKER_PATTERN, (marker, rawCitationNumber) => {
    const citationNumber = Number(rawCitationNumber)
    if (!Number.isSafeInteger(citationNumber) || citationNumber < 1) return marker

    const citationIndex = citationNumber - 1
    const citation = citations[citationIndex]
    if (citation === undefined) return marker

    let displayCitationNumber = remappedCitationNumbers.get(citationIndex)
    if (displayCitationNumber === undefined) {
      displayCitations.push(citation)
      displayCitationNumber = displayCitations.length
      remappedCitationNumbers.set(citationIndex, displayCitationNumber)
    }

    return `[${displayCitationNumber}]`
  })

  return { content: displayContent, citations: displayCitations }
}

export function renderMetricsSummary(metrics: ChatGenerationMetrics | null | undefined) {
  if (!metrics) return null

  const parts = [
    metrics.tokensPerSecond !== null ? `${metrics.tokensPerSecond} tok/s` : null,
    metrics.timeToFirstTokenMs !== null ? `TTFT ${formatDurationMs(metrics.timeToFirstTokenMs)}` : null,
    metrics.totalDurationMs !== null ? `Total ${formatDurationMs(metrics.totalDurationMs)}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(" • ") : null
}

export function formatDurationMs(value: number | null) {
  if (value === null) return null
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(1)} s`
}

export function statusLabel(status: ChatStreamStatus | null) {
  switch (status) {
    case "retrieval":
      return "Searching documents"
    case "generation":
      return "Generating the answer"
    case "saving":
      return "Saving the answer"
    default:
      return "Preparing the answer"
  }
}

export function emptyAssistantResponseMessage({
  generationStatus,
  generationError,
}: {
  generationStatus: ChatMessageMetadata["generationStatus"]
  generationError: string | null
}) {
  if (generationStatus === "failed") return generationError ?? "The model did not return an answer."
  if (generationStatus === "completed") return "The model returned an empty answer."
  return null
}
