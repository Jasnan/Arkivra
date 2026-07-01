import { fetchJson } from "@/lib/api"

export interface CitationBoundingBox {
  pageNumber: number
  x0: number
  y0: number
  x1: number
  y1: number
  layoutWidth: number
  layoutHeight: number
  system: string
}

export interface CitationTextLocator {
  sourceType: "rawMarkdown" | "rawText"
  startOffset: number
  endOffset: number
}

export interface Citation {
  chunkId: string
  documentId: string
  documentVersionId?: string
  versionNumber?: number
  vaultId: string
  vaultName: string
  documentName: string
  mimeType?: string
  pageStart: number | null
  pageEnd: number | null
  section: string | null
  sectionPath?: string[]
  sourceElementIds?: string[]
  tableSourceElementIds?: string[]
  snippet: string
  boundingBoxes: CitationBoundingBox[]
  citationPrecision: "box" | "page" | "document"
  assetType: "text" | "table" | "image"
  tablesHtml: string[]
  imageAssetIds: string[]
  imageAssets?: {
    assetId: string
    sourceElementId: string | null
    caption?: string | null
    pageNumber?: number | null
  }[]
  textLocator?: CitationTextLocator
  score: number
}

export interface ChatConversation {
  id: string
  vaultId: string | null
  documentId: string | null
  scope: "global" | "vault" | "document"
  contextSnapshot: ChatContextSnapshot
  userId: string | null
  title: string
  createdAt: string
  updatedAt: string
}

export type ChatContextSnapshot =
  | { type: "global"; vaultIds: string[] }
  | { type: "vault"; vaultId: string; vaultName?: string }
  | {
      type: "document"
      vaultId: string
      documentId: string
      vaultName?: string
      documentName?: string
    }
  | { type: "selection"; vaults: ChatContextVaultRef[]; documents: ChatContextDocumentRef[] }

export interface ChatContextVaultRef {
  vaultId: string
  name?: string
}

export interface ChatContextDocumentRef {
  vaultId: string
  documentId: string
  documentVersionId?: string
  versionNumber?: number
  name?: string
  vaultName?: string
  path?: string
}

export type ChatContextAvailability =
  | { status: "available"; readOnly: false }
  | { status: "source_document_deleted"; readOnly: true; message: string }

export type ChatIntent = "search" | "summarize" | "compare" | "extract"
export type ChatResponseMode = "text" | "multimodal"
export type ChatStreamStatus = "retrieval" | "generation" | "saving"

export interface ChatGenerationMetrics {
  promptEvalCount: number | null
  promptEvalDurationMs: number | null
  evalCount: number | null
  evalDurationMs: number | null
  totalDurationMs: number | null
  loadDurationMs: number | null
  tokensPerSecond: number | null
  timeToFirstTokenMs: number | null
}

export interface ChatMessageMetadata {
  intent?: ChatIntent
  model?: string
  quickReplies?: string[]
  followUpQuestion?: boolean
  citations?: Citation[]
  generationMetrics?: ChatGenerationMetrics | null
  generationStatus?: "pending" | "completed" | "failed" | null
  generationError?: string | null
  createdAt?: string
  updatedAt?: string
  conversationId?: string
  vaultId?: string | null
  documentId?: string | null
  scope?: "global" | "vault" | "document"
  userId?: string | null
}

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "data-status"; data: { label: ChatStreamStatus } }
  | { type: "data-citations"; data: Citation[] }
  | { type: "data-metrics"; data: ChatGenerationMetrics }
  | { type: `data-${string}`; data: unknown }
  | { type: "file"; mediaType?: string; url?: string }

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  metadata?: ChatMessageMetadata
  parts: ChatMessagePart[]
}

export interface ChatConversationDetail extends ChatConversation {
  contextAvailability?: ChatContextAvailability
  messages: ChatMessage[]
}

export interface ChatModelOptions {
  defaultModel: string
  models: string[]
}

export interface UserUiPreferences {
  defaultChatAnswerMode?: ChatResponseMode
}

export interface ChatApiScope {
  vaultId?: string
  documentId?: string
}

export function getChatContextSnapshot({ vaultId, documentId }: ChatApiScope): ChatContextSnapshot {
  if (vaultId && documentId) return { type: "document", vaultId, documentId }
  if (vaultId) return { type: "vault", vaultId }
  return { type: "global", vaultIds: [] }
}

export async function listChatConversations() {
  return fetchJson<{ conversations: ChatConversation[] }>("/api/chats")
}

export async function getChatModelOptions() {
  return fetchJson<{ options: ChatModelOptions }>("/api/chats/options")
}

export async function createChatConversation({
  title,
  contextSnapshot,
  ...scope
}: ChatApiScope & {
  title?: string
  contextSnapshot?: ChatContextSnapshot
}) {
  return fetchJson<{ conversation: ChatConversation }>("/api/chats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, contextSnapshot: contextSnapshot ?? getChatContextSnapshot(scope) }),
  })
}

export async function getChatConversation({ chatId }: { chatId: string }) {
  return fetchJson<{ conversation: ChatConversationDetail }>(`/api/chats/${chatId}`)
}

export async function updateChatConversationContext({
  chatId,
  contextSnapshot,
}: {
  chatId: string
  contextSnapshot: ChatContextSnapshot
}) {
  return fetchJson<{ conversation: ChatConversation }>(`/api/chats/${chatId}/context`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contextSnapshot }),
  })
}

export async function deleteChatConversation({ chatId }: { chatId: string }) {
  return fetchJson<void>(`/api/chats/${chatId}`, {
    method: "DELETE",
  })
}

export async function getUserUiPreferences() {
  return fetchJson<{ preferences: UserUiPreferences }>("/api/me/preferences")
}
