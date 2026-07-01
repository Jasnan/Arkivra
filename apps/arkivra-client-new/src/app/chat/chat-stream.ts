import type {
  ChatGenerationMetrics,
  ChatIntent,
  ChatMessage,
  ChatMessageMetadata,
  ChatResponseMode,
  ChatStreamStatus,
  Citation,
} from "./chat.api"

type StreamChunk =
  | { type: "start"; messageId?: string; messageMetadata?: ChatMessageMetadata }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "data-status"; data: { label: ChatStreamStatus } }
  | { type: "data-citations"; data: Citation[] }
  | { type: "data-metrics"; data: ChatGenerationMetrics }
  | { type: "finish"; finishReason?: string; messageMetadata?: ChatMessageMetadata }
  | { type: "error"; errorText?: string }

export interface StreamChatMessageOptions {
  chatId: string
  messages: ChatMessage[]
  intent?: ChatIntent | null
  responseMode: ChatResponseMode
  model?: string
  signal?: AbortSignal
  onAssistantMessage: (message: ChatMessage) => void
}

export async function streamChatMessage({
  chatId,
  messages,
  intent,
  responseMode,
  model,
  signal,
  onAssistantMessage,
}: StreamChatMessageOptions) {
  const response = await fetch(`/api/chats/${chatId}/messages/stream`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: chatId,
      messages,
      intent: intent ?? undefined,
      responseMode,
      model,
    }),
  })

  if (!response.ok) {
    const message = await readErrorMessage(response)
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error("The chat stream did not return a response body.")
  }

  let assistantMessage: ChatMessage = {
    id: `msg-${crypto.randomUUID()}`,
    role: "assistant",
    metadata: {
      conversationId: chatId,
      generationStatus: "pending",
      generationError: null,
      createdAt: new Date().toISOString(),
    },
    parts: [{ type: "data-status", data: { label: "generation" } }],
  }

  for await (const chunk of parseSseJsonStream(response.body)) {
    assistantMessage = applyStreamChunk(assistantMessage, chunk)
    onAssistantMessage(assistantMessage)
  }

  return assistantMessage
}

async function readErrorMessage(response: Response) {
  try {
    const json = (await response.json()) as { error?: { message?: unknown } }
    if (typeof json.error?.message === "string") return json.error.message
  } catch {
    // Preserve the status-derived fallback when the body is not JSON.
  }
  return response.statusText || `Request failed with status ${response.status}`
}

async function* parseSseJsonStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const normalized = buffer.replace(/\r\n/g, "\n")
      const frames = normalized.split("\n\n")
      buffer = frames.pop() ?? ""

      for (const frame of frames) {
        const parsed = parseSseFrame(frame)
        if (parsed) yield parsed
      }
    }

    buffer += decoder.decode()
    const parsed = parseSseFrame(buffer)
    if (parsed) yield parsed
  } finally {
    reader.releaseLock()
  }
}

function parseSseFrame(frame: string): StreamChunk | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim()

  if (!data || data === "[DONE]") return null

  try {
    return JSON.parse(data) as StreamChunk
  } catch {
    return null
  }
}

function applyStreamChunk(message: ChatMessage, chunk: StreamChunk): ChatMessage {
  switch (chunk.type) {
    case "start":
      return {
        ...message,
        id: chunk.messageId || message.id,
        metadata: {
          ...message.metadata,
          ...chunk.messageMetadata,
          conversationId: chunk.messageMetadata?.conversationId ?? message.metadata?.conversationId,
          generationStatus: "pending",
          generationError: null,
        },
      }
    case "text-start":
      return message.parts.some((part) => part.type === "text")
        ? message
        : { ...message, parts: [...message.parts, { type: "text", text: "" }] }
    case "text-delta":
      return {
        ...message,
        parts: appendTextDelta(message.parts, chunk.delta),
      }
    case "data-status":
      return {
        ...message,
        parts: [...message.parts.filter((part) => part.type !== "data-status"), chunk],
      }
    case "data-citations":
      return {
        ...message,
        metadata: { ...message.metadata, citations: chunk.data },
        parts: [...message.parts.filter((part) => part.type !== "data-citations"), chunk],
      }
    case "data-metrics":
      return {
        ...message,
        metadata: { ...message.metadata, generationMetrics: chunk.data },
        parts: [...message.parts.filter((part) => part.type !== "data-metrics"), chunk],
      }
    case "error":
      return {
        ...message,
        metadata: {
          ...message.metadata,
          generationStatus: "failed",
          generationError: chunk.errorText || "Could not generate an answer.",
        },
      }
    case "finish":
      return {
        ...message,
        metadata: {
          ...message.metadata,
          ...chunk.messageMetadata,
          generationStatus:
            chunk.messageMetadata?.generationStatus ??
            (chunk.finishReason === "error" ? "failed" : "completed"),
        },
        parts: message.parts.filter((part) => part.type !== "data-status"),
      }
    default:
      return message
  }
}

function appendTextDelta(parts: ChatMessage["parts"], delta: string): ChatMessage["parts"] {
  const textPartIndex = parts.findIndex((part) => part.type === "text")
  if (textPartIndex === -1) {
    return [...parts, { type: "text", text: delta }]
  }

  return parts.map((part, index) =>
    index === textPartIndex && part.type === "text"
      ? { ...part, text: `${part.text}${delta}` }
      : part
  )
}
