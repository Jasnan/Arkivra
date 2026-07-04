import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk"
import type { ChatContextSnapshot, ChatIntent, ChatMessage, ChatResponseMode } from "../chat.api"

export interface AssistantChatTransportConfig {
  chatId: string
  contextSnapshot: ChatContextSnapshot
  intent?: ChatIntent | null
  responseMode: ChatResponseMode
  model?: string
}

export function startsWithSameMessageIds(messages: ChatMessage[], prefix: ChatMessage[]) {
  if (prefix.length > messages.length) return false
  return prefix.every((message, index) => message.id === messages[index]?.id)
}

export function createAssistantChatTransport({
  getConfig,
}: {
  getConfig: () => AssistantChatTransportConfig
}) {
  return new AssistantChatTransport<ChatMessage>({
    credentials: "include",
    api: "/api/chats/messages/stream",
    prepareSendMessagesRequest: async (options) => {
      const { chatId, contextSnapshot, intent, model, responseMode } = getConfig()
      const requestMetadata = options.requestMetadata as {
        chatId?: string
        contextSnapshot?: ChatContextSnapshot
        intent?: ChatIntent | null
      } | undefined
      const resolvedChatId = requestMetadata?.chatId ?? chatId
      const resolvedContextSnapshot = requestMetadata?.contextSnapshot ?? contextSnapshot
      const resolvedIntent = requestMetadata?.intent ?? intent ?? undefined

      return {
        api: "/api/chats/messages/stream",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: {
          ...options.body,
          chatId: resolvedChatId || undefined,
          contextSnapshot: resolvedChatId ? undefined : resolvedContextSnapshot,
          messages: options.messages,
          intent: resolvedIntent,
          responseMode,
          model,
        },
      }
    },
  })
}
