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

type RuntimeAdapters = NonNullable<Parameters<typeof useAISDKRuntime<ArkivraChatMessage>>[1]>["adapters"]

function useDynamicChatTransport<UI_MESSAGE extends ArkivraChatMessage>(
  transport: ChatTransport<UI_MESSAGE>,
) {
  const transportRef = useRef(transport)

  useEffect(() => {
    transportRef.current = transport
  })

  return useMemo(
    () =>
      new Proxy(transportRef.current, {
        get(_, prop) {
          const value = transportRef.current[prop as keyof ChatTransport<UI_MESSAGE>]
          return typeof value === "function" ? value.bind(transportRef.current) : value
        },
      }),
    [],
  )
}

function useArkivraChatThreadRuntime(
  options: {
    transport: ChatTransport<ArkivraChatMessage>
    adapters: RuntimeAdapters
  },
) {
  const transport = useDynamicChatTransport(options.transport)
  const id = useAuiState((state) => state.threadListItem.id)
  const aui = useAui()
  const chat = useChat<ArkivraChatMessage>({
    id,
    transport,
  })
  const resumedStreamRef = useRef(false)

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

  if (transport instanceof AssistantChatTransport) {
    transport.setRuntime(runtime)
    transport.__internal_setGetThreadListItem(() =>
      aui.threadListItem.source ? aui.threadListItem() : undefined,
    )
  }

  return runtime
}

export function ChatRuntimeProvider({ children }: { children: ReactNode }) {
  const transport = useMemo(() => createArkivraChatTransport(), [])
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
        transport,
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
