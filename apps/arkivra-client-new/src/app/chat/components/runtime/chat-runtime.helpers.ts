import {
  AssistantChatTransport,
  createResumableSessionStorage,
} from "@assistant-ui/react-ai-sdk"
import type { AppendMessage } from "@assistant-ui/react"
import type { CreateUIMessage, UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai"

import type { DraftChatContext, DraftChatDocument, DraftChatVault } from "@/app/chat/lib/chat-context-model"
import { normalizeDraftContext } from "@/app/chat/lib/chat-context-model"

const VAULT_ATTACHMENT_PREFIX = "arkivra-vault:"
const DOCUMENT_ATTACHMENT_PREFIX = "arkivra-document:"

type ArkivraChatMetadata = {
  custom?: {
    contextSnapshot?: ChatContextSnapshot
    [key: string]: unknown
  }
  [key: string]: unknown
}

type ChatContextSnapshot =
  | { type: "global"; vaultIds: string[] }
  | { type: "selection"; vaults: DraftChatVault[]; documents: DraftChatDocument[] }

export type ArkivraChatMessage = UIMessage<ArkivraChatMetadata>

function parseContextAttachmentId(attachment: NonNullable<AppendMessage["attachments"]>[number]) {
  if (attachment.id.startsWith(VAULT_ATTACHMENT_PREFIX)) {
    return {
      type: "vault" as const,
      vault: {
        vaultId: attachment.id.slice(VAULT_ATTACHMENT_PREFIX.length),
        name: attachment.name,
      },
    }
  }

  if (attachment.id.startsWith(DOCUMENT_ATTACHMENT_PREFIX)) {
    const rawKey = attachment.id.slice(DOCUMENT_ATTACHMENT_PREFIX.length)
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

function getContextFromAttachments(attachments: AppendMessage["attachments"]): DraftChatContext {
  const context = normalizeDraftContext({
    vaults: [],
    documents: [],
  })

  for (const attachment of attachments ?? []) {
    const parsed = parseContextAttachmentId(attachment)
    if (parsed?.type === "vault") {
      context.vaults.push(parsed.vault)
    } else if (parsed?.type === "document") {
      context.documents.push(parsed.document)
    }
  }

  return normalizeDraftContext(context)
}

function toContextSnapshot(context: DraftChatContext): ChatContextSnapshot {
  const normalized = normalizeDraftContext(context)

  if (normalized.vaults.length === 0 && normalized.documents.length === 0) {
    return { type: "global", vaultIds: [] }
  }

  return {
    type: "selection",
    vaults: normalized.vaults,
    documents: normalized.documents,
  }
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
  const contextSnapshot = toContextSnapshot(getContextFromAttachments(message.attachments))
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

export function createArkivraChatTransport() {
  return new AssistantChatTransport<ArkivraChatMessage>({
    api: "/api/chats/messages/stream",
    credentials: "include",
    resumable: {
      storage: createResumableSessionStorage({
        key: "arkivra-chat-resumable-stream-id",
      }),
      resumeApi: (streamId) => `/api/chats/messages/stream/${encodeURIComponent(streamId)}`,
    },
  })
}
