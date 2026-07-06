"use client"

import { useEffect, useMemo, useRef, type ReactNode } from "react"
import { useChat } from "@ai-sdk/react"
import {
  AssistantRuntimeProvider,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
  useAui,
  useAuiState,
  useRemoteThreadListRuntime,
  type FeedbackAdapter,
} from "@assistant-ui/react"
import { AssistantChatTransport, useAISDKRuntime } from "@assistant-ui/react-ai-sdk"
import type { ChatTransport } from "ai"

import {
  createArkivraChatTransport,
  toArkivraCreateMessage,
  type ArkivraChatMessage,
} from "@/app/chat/components/runtime/chat-runtime.helpers"
import { createArkivraThreadListAdapter } from "@/app/chat/components/runtime/chat-thread-adapter"

const feedbackAdapter: FeedbackAdapter = {
  submit: async () => {},
}

const DEFAULT_THREAD_TITLE = "New chat"

type RuntimeAdapters = NonNullable<Parameters<typeof useAISDKRuntime<ArkivraChatMessage>>[1]>["adapters"]

function useArkivraChatThreadRuntime(
  options: {
    adapters: RuntimeAdapters
  },
) {
  const id = useAuiState((state) => state.threadListItem.id)
  const transport = useMemo<ChatTransport<ArkivraChatMessage>>(
    () =>
      createArkivraChatTransport({
        storageKey: `arkivra-chat-resumable-stream-id:${id}`,
      }),
    [id],
  )
  const aui = useAui()
  const chat = useChat<ArkivraChatMessage>({
    id,
    transport,
  })
  const resumedStreamRef = useRef(false)
  const wasRunningRef = useRef(false)
  const titleGenerationRunRef = useRef<string | null>(null)

  useEffect(() => {
    if (resumedStreamRef.current) return
    if (!(transport instanceof AssistantChatTransport)) return

    const resumableAdapter = transport.getResumableAdapter()
    if (resumableAdapter?.storage.getStreamId() === null) return

    resumedStreamRef.current = true
    void chat.resumeStream()
  }, [chat, transport])

  const runtime = useAISDKRuntime(chat, {
    adapters: options.adapters,
    toCreateMessage: toArkivraCreateMessage,
    unstable_capabilities: {
      copy: true,
    },
  })

  useEffect(() => {
    const isRunning = chat.status === "submitted" || chat.status === "streaming"
    const wasRunning = wasRunningRef.current
    wasRunningRef.current = isRunning

    if (isRunning || !wasRunning) return
    if (!chat.messages.some((message) => message.role === "user")) return
    if (!aui.threadListItem.source) return

    const threadListItem = aui.threadListItem()
    const threadState = threadListItem.getState()
    console.log("Arkivra chat title generation state", {
      chatId: id,
      threadStateId: threadState.id,
      threadStateRemoteId: threadState.remoteId,
      currentThreadRemoteId: aui.threadListItem().getState().remoteId,
    })
    if (threadState.id !== id) return
    if (!threadState.remoteId) return

    const currentTitle = threadState.title?.trim()
    if (currentTitle && currentTitle !== DEFAULT_THREAD_TITLE) return

    const userMessages = chat.messages.filter((message) => message.role === "user")
    const lastUserMessage = userMessages[userMessages.length - 1]
    const runKey = `${threadState.id}:${lastUserMessage?.id ?? "unknown"}:${chat.messages.length}`
    if (titleGenerationRunRef.current === runKey) return

    titleGenerationRunRef.current = runKey
    void Promise.resolve(threadListItem.generateTitle()).catch((error: unknown) => {
      console.error("Failed to generate chat title:", error)
    })
  }, [aui, chat.messages, chat.status, id])

  if (transport instanceof AssistantChatTransport) {
    const boundThreadListItem = aui.threadListItem.source ? aui.threadListItem() : undefined
    const boundThreadListItemId = boundThreadListItem?.getState().id

    transport.setRuntime(runtime)
    transport.__internal_setGetThreadListItem(() => {
      if (!boundThreadListItem || boundThreadListItemId !== id) return undefined

      return boundThreadListItem.getState().id === id ? boundThreadListItem : undefined
    })
  }

  return runtime
}

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const threadListAdapter = useMemo(() => createArkivraThreadListAdapter(), [])
  const adapters = useMemo(
    () => ({
      speech: new WebSpeechSynthesisAdapter(),
      dictation: new WebSpeechDictationAdapter(),
      feedback: feedbackAdapter,
      attachments: undefined,
    }),
    []
  )

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: function RuntimeHook() {
      return useArkivraChatThreadRuntime({
        adapters,
      })
    },
    adapter: threadListAdapter,
    allowNesting: true,
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}
