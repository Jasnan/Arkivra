import {
  AssistantChatTransport,
  createResumableSessionStorage,
} from "@assistant-ui/react-ai-sdk"
import type { AppendMessage } from "@assistant-ui/react"
import type { CreateUIMessage, UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"

import type {
  ChatContextSnapshot,
  DraftChatContext,
} from "@/app/chat/lib/chat-context-model"
import {
  DOCUMENT_CONTEXT_ATTACHMENT_PREFIX,
  VAULT_CONTEXT_ATTACHMENT_PREFIX,
  normalizeDraftContext,
  snapshotFromDraftContext,
} from "@/app/chat/lib/chat-context-model"

type ArkivraChatMetadata = {
  custom?: {
    contextSnapshot?: ChatContextSnapshot
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type ArkivraChatMessage = UIMessage<ArkivraChatMetadata>

export type ArkivraChatIntent = "search" | "summarize" | "compare" | "extract"

export function getChatIntentFromRequestMetadata(metadata: unknown): ArkivraChatIntent | undefined {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return undefined
  const custom = (metadata as { custom?: unknown }).custom
  if (custom === null || typeof custom !== "object" || Array.isArray(custom)) return undefined
  const intent = (custom as { intent?: unknown }).intent
  return intent === "search" || intent === "summarize" || intent === "compare" || intent === "extract"
    ? intent
    : undefined
}

function parseContextTextPart(text: string) {
  const lines = text.split(/\r?\n/)
  const header = lines[0]?.trim()
  if (header !== "Arkivra vault context" && header !== "Arkivra document context") {
    return null
  }

  const fields = new Map<string, string>()
  for (const line of lines.slice(1)) {
    const separatorIndex = line.indexOf(":")
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    if (key.length > 0 && value.length > 0) {
      fields.set(key, value)
    }
  }

  if (header === "Arkivra vault context") {
    const vaultId = fields.get("vaultId")
    if (!vaultId) return null

    return {
      type: "vault" as const,
      vault: {
        vaultId,
        name: fields.get("name"),
      },
    }
  }

  const vaultId = fields.get("vaultId")
  const documentId = fields.get("documentId")
  if (!vaultId || !documentId) return null

  return {
    type: "document" as const,
    document: {
      vaultId,
      documentId,
      name: fields.get("name"),
      vaultName: fields.get("vaultName"),
    },
  }
}

function parseContextAttachmentId(attachment: NonNullable<AppendMessage["attachments"]>[number]) {
  if (attachment.id?.startsWith(VAULT_CONTEXT_ATTACHMENT_PREFIX)) {
    return {
      type: "vault" as const,
      vault: {
        vaultId: attachment.id.slice(VAULT_CONTEXT_ATTACHMENT_PREFIX.length),
        name: attachment.name,
      },
    }
  }

  if (attachment.id?.startsWith(DOCUMENT_CONTEXT_ATTACHMENT_PREFIX)) {
    const rawKey = attachment.id.slice(DOCUMENT_CONTEXT_ATTACHMENT_PREFIX.length)
    const separatorIndex = rawKey.indexOf(":")
    if (separatorIndex === -1) return null

    return {
      type: "document" as const,
      document: {
        vaultId: rawKey.slice(0, separatorIndex),
        documentId: rawKey.slice(separatorIndex + 1),
        name: attachment.name,
        mimeType: attachment.contentType,
      },
    }
  }

  return null
}

function getContextFromMessage(message: AppendMessage): DraftChatContext {
  const context = normalizeDraftContext({
    vaults: [],
    documents: [],
  })

  const parsedContextItems = [
    ...(message.attachments ?? []).flatMap((attachment) => [
      parseContextAttachmentId(attachment),
      ...attachment.content.flatMap((part) => (
        part.type === "text" ? [parseContextTextPart(part.text)] : []
      )),
    ]),
    ...message.content.flatMap((part) => (
      part.type === "text" ? [parseContextTextPart(part.text)] : []
    )),
  ]

  for (const parsed of parsedContextItems) {
    if (parsed?.type === "vault") {
      context.vaults.push(parsed.vault)
    } else if (parsed?.type === "document") {
      context.documents.push(parsed.document)
    }
  }

  return normalizeDraftContext(context)
}

function isArkivraContextTextPart(part: UIMessagePart<UIDataTypes, UITools>) {
  return (
    part.type === "text" &&
    (part.text.startsWith("Arkivra vault context\n") ||
      part.text.startsWith("Arkivra document context\n"))
  )
}

export function toArkivraCreateMessage<UI_MESSAGE extends UIMessage = ArkivraChatMessage>(
  message: AppendMessage,
): CreateUIMessage<UI_MESSAGE> {
  const contextSnapshot = snapshotFromDraftContext(getContextFromMessage(message))
  const parts = message.content.flatMap((part): UIMessagePart<UIDataTypes, UITools>[] => {
    if (part.type === "text") {
      return isArkivraContextTextPart({ type: "text", text: part.text }) ? [] : [{ type: "text", text: part.text }]
    }

    if (part.type === "image") {
      return [{ type: "file", url: part.image, mediaType: "image/png" }]
    }

    if (part.type === "file") {
      return [{
        type: "file",
        url: part.data,
        mediaType: part.mimeType,
        ...(part.filename ? { filename: part.filename } : {}),
      }]
    }

    if (part.type === "data") {
      return [{ type: `data-${part.name}`, data: part.data }]
    }

    throw new Error(`Unsupported message part type: ${part.type}`)
  })

  return {
    role: message.role,
    parts,
    metadata: {
      ...(typeof message.metadata === "object" && message.metadata !== null ? message.metadata : {}),
      custom: {
        ...message.metadata?.custom,
        contextSnapshot,
      },
    },
  } as CreateUIMessage<UI_MESSAGE>
}

export function createArkivraChatTransport({
  storageKey,
  getChatId,
  getContextSnapshot,
}: {
  storageKey?: string
  getChatId?: () => string | undefined | Promise<string | undefined>
  getContextSnapshot?: () => unknown
} = {}) {
  return new AssistantChatTransport<ArkivraChatMessage>({
    api: "/api/chats/messages/stream",
    credentials: "include",
    prepareSendMessagesRequest: async (options) => {
      const chatId = await getChatId?.()
      const contextSnapshot = getContextSnapshot?.()
      const intent = getChatIntentFromRequestMetadata(options.requestMetadata)
      const messages = Array.isArray(options.messages) ? options.messages : []
      const latestMessage = messages.at(-1)
      const latestMessageContextSnapshot = latestMessage?.metadata?.custom?.contextSnapshot

      console.debug("[Arkivra chat context] outgoing stream request", {
        threadId: options.id,
        chatId,
        trigger: options.trigger,
        messageId: options.messageId,
        messageCount: messages.length,
        bodyContextSnapshot: contextSnapshot,
        latestMessageContextSnapshot,
        latestMessageRole: latestMessage?.role,
        latestMessagePartTypes: latestMessage?.parts?.map((part) => part.type),
      })

      return {
        body: {
          ...options.body,
          id: options.id,
          ...(chatId ? { chatId } : {}),
          messages: options.messages,
          trigger: options.trigger,
          messageId: options.messageId,
          metadata: options.requestMetadata,
          ...(intent ? { intent } : {}),
          ...(contextSnapshot !== undefined ? { contextSnapshot } : {}),
        },
      }
    },
    resumable: {
      storage: createResumableSessionStorage({
        key: storageKey ?? "arkivra-chat-resumable-stream-id",
      }),
      resumeApi: (streamId) => `/api/chats/messages/stream/${encodeURIComponent(streamId)}`,
    },
  })
}
