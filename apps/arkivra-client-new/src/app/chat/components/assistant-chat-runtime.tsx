import type { ReactNode } from "react"
import { useEffect, useId, useMemo, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { AssistantRuntimeProvider } from "@assistant-ui/react"
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk"

import type { ChatContextSnapshot, ChatIntent, ChatMessage, ChatResponseMode } from "../chat.api"
import {
  createAssistantChatTransport,
  startsWithSameMessageIds,
  type AssistantChatTransportConfig,
} from "./assistant-chat-runtime.helpers"

export type AssistantChatRuntimeStatus = ReturnType<typeof useChat<ChatMessage>>["status"]

export interface AssistantChatRuntimeHandle {
  sendText: (text: string, options?: {
    chatId?: string
    contextSnapshot?: ChatContextSnapshot
    intent?: ChatIntent | null
  }) => Promise<void>
  stop: () => Promise<void>
}

export interface AssistantChatRuntimeState {
  status: AssistantChatRuntimeStatus
  messageCount: number
}

export function AssistantChatRuntimeProvider({
  chatId,
  contextSnapshot,
  messages,
  disabled,
  intent,
  responseMode,
  model,
  onStateChange,
  onMessagesChange,
  onReady,
  onFinish,
  children,
}: {
  chatId: string
  contextSnapshot: ChatContextSnapshot
  messages: ChatMessage[]
  disabled: boolean
  intent?: ChatIntent | null
  responseMode: ChatResponseMode
  model?: string
  onStateChange?: (state: AssistantChatRuntimeState) => void
  onMessagesChange?: (messages: ChatMessage[]) => void
  onReady?: (handle: AssistantChatRuntimeHandle | null) => void
  onFinish?: () => void
  children: ReactNode
}) {
  const runtimeId = useId()
  const transportConfigRef = useRef<AssistantChatTransportConfig>({
    chatId,
    contextSnapshot,
    intent,
    model,
    responseMode,
  })

  transportConfigRef.current = {
    chatId,
    contextSnapshot,
    intent,
    model,
    responseMode,
  }

  const transport = useMemo(
    () =>
      createAssistantChatTransport({
        getConfig: () => transportConfigRef.current,
      }),
    []
  )

  const chat = useChat<ChatMessage>({
    id: runtimeId,
    messages,
    transport,
    onFinish,
  })
  const runtime = useAISDKRuntime(chat, {
    isSendDisabled: disabled,
    unstable_capabilities: {
      copy: true,
    },
  })
  const chatRef = useRef(chat)
  const intentRef = useRef(intent)
  const lastStateRef = useRef<AssistantChatRuntimeState | null>(null)
  const previousChatIdRef = useRef(chatId)

  useEffect(() => {
    chatRef.current = chat
    intentRef.current = intent
  }, [chat, intent])

  useEffect(() => {
    const previousChatId = previousChatIdRef.current
    const isSameConversation = previousChatId === chatId
    const isCreatedDraftConversation = previousChatId.length === 0 && chatId.length > 0
    previousChatIdRef.current = chatId
    const isRunning = chat.status === "submitted" || chat.status === "streaming"

    if (!isSameConversation && isRunning) {
      return
    }

    if (
      (isSameConversation || isCreatedDraftConversation) &&
      startsWithSameMessageIds(chat.messages, messages) &&
      chat.messages.length > 0 &&
      chat.messages.length > messages.length
    ) {
      return
    }

    chat.setMessages(messages)
    // Keep this effect scoped to selected conversation/server-state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, chat.messages.length, chat.status, messages])

  useEffect(() => {
    const nextState = {
      status: chat.status,
      messageCount: chat.messages.length,
    }
    const previousState = lastStateRef.current

    if (
      previousState &&
      previousState.status === nextState.status &&
      previousState.messageCount === nextState.messageCount
    ) {
      return
    }

    lastStateRef.current = nextState
    onStateChange?.(nextState)
  }, [chat.messages.length, chat.status, onStateChange])

  useEffect(() => {
    onMessagesChange?.(chat.messages)
  }, [chat.messages, onMessagesChange])

  useEffect(() => {
    onReady?.({
      sendText: async (text, options) => {
        await chatRef.current.sendMessage(
          {
            text,
            metadata: options?.intent ? { intent: options.intent } : undefined,
          },
          {
            metadata: {
              chatId: options?.chatId,
              contextSnapshot: options?.contextSnapshot,
              intent: options?.intent ?? intentRef.current ?? undefined,
            },
          }
        )
      },
      stop: async () => {
        await chatRef.current.stop()
      },
    })

    return () => onReady?.(null)
  }, [onReady])

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
