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

import { documentKey, normalizeDraftContext } from "@/app/chat/lib/chat-context-model"
import {
  createArkivraChatTransport,
  toArkivraCreateMessage,
  type ArkivraChatMessage,
} from "@/app/chat/components/runtime/chat-runtime.helpers"
import {
  getLiveThreadContextSnapshot,
  setLiveThreadContextSnapshot,
} from "@/app/chat/components/runtime/chat-live-thread-context"
import { createArkivraThreadListAdapter } from "@/app/chat/components/runtime/chat-thread-adapter"

const feedbackAdapter: FeedbackAdapter = {
  submit: async () => {},
}

const DEFAULT_THREAD_TITLE = "New chat"
const VAULT_ATTACHMENT_PREFIX = "arkivra-vault:"
const DOCUMENT_ATTACHMENT_PREFIX = "arkivra-document:"

type RuntimeAdapters = NonNullable<Parameters<typeof useAISDKRuntime<ArkivraChatMessage>>[1]>["adapters"]

type ComposerContextAttachment = {
  id?: string
  name?: string
  contentType?: string
}

function snapshotFromComposerAttachments(attachments: readonly ComposerContextAttachment[]) {
  const context = normalizeDraftContext({
    vaults: attachments.flatMap((attachment) => {
      if (!attachment.id?.startsWith(VAULT_ATTACHMENT_PREFIX)) return []

      return [{
        vaultId: attachment.id.slice(VAULT_ATTACHMENT_PREFIX.length),
        name: attachment.name,
      }]
    }),
    documents: attachments.flatMap((attachment) => {
      if (!attachment.id?.startsWith(DOCUMENT_ATTACHMENT_PREFIX)) return []
      const rawKey = attachment.id.slice(DOCUMENT_ATTACHMENT_PREFIX.length)
      const separatorIndex = rawKey.indexOf(":")
      if (separatorIndex === -1) return []

      return [{
        vaultId: rawKey.slice(0, separatorIndex),
        documentId: rawKey.slice(separatorIndex + 1),
        name: attachment.name,
        mimeType: attachment.contentType,
      }]
    }),
  })

  if (context.vaults.length === 0 && context.documents.length === 0) {
    return { type: "global" as const, vaultIds: [] }
  }

  return {
    type: "selection" as const,
    vaults: context.vaults,
    documents: context.documents,
  }
}

function hasComposerContextAttachments(attachments: readonly ComposerContextAttachment[]) {
  return attachments.some((attachment) => (
    attachment.id?.startsWith(VAULT_ATTACHMENT_PREFIX) ||
    attachment.id?.startsWith(DOCUMENT_ATTACHMENT_PREFIX)
  ))
}

function snapshotKey(snapshot: unknown) {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) return ""
  const value = snapshot as {
    type?: unknown
    vaultIds?: unknown
    vaults?: unknown
    documents?: unknown
    vaultId?: unknown
    documentId?: unknown
  }

  if (value.type === "global") {
    return Array.isArray(value.vaultIds)
      ? `global:${value.vaultIds.filter((vaultId): vaultId is string => typeof vaultId === "string").sort().join("|")}`
      : "global"
  }

  if (value.type === "selection") {
    const vaultKeys = Array.isArray(value.vaults)
      ? value.vaults.flatMap((vault) => (
          vault !== null &&
          typeof vault === "object" &&
          !Array.isArray(vault) &&
          typeof (vault as { vaultId?: unknown }).vaultId === "string"
            ? [`v:${(vault as { vaultId: string }).vaultId}`]
            : []
        ))
      : []
    const documentKeys = Array.isArray(value.documents)
      ? value.documents.flatMap((document) => {
          if (document === null || typeof document !== "object" || Array.isArray(document)) return []
          const ref = document as { vaultId?: unknown; documentId?: unknown }
          return typeof ref.vaultId === "string" && typeof ref.documentId === "string"
            ? [`d:${documentKey({ vaultId: ref.vaultId, documentId: ref.documentId })}`]
            : []
        })
      : []

    return [...vaultKeys.sort(), ...documentKeys.sort()].join("|")
  }

  if (value.type === "vault" && typeof value.vaultId === "string") {
    return `v:${value.vaultId}`
  }

  if (value.type === "document" && typeof value.vaultId === "string" && typeof value.documentId === "string") {
    return `d:${documentKey({ vaultId: value.vaultId, documentId: value.documentId })}`
  }

  return ""
}

function getStreamedConversation(messages: readonly ArkivraChatMessage[]) {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    if (message === undefined) continue

    const parts = message.parts ?? []
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex]
      if (part === undefined) continue
      if (part.type !== "data-conversation") continue
      const data = part.data
      if (data === null || typeof data !== "object" || Array.isArray(data)) continue
      const conversation = (data as { conversation?: unknown }).conversation
      if (conversation === null || typeof conversation !== "object" || Array.isArray(conversation)) continue

      const value = conversation as { id?: unknown; contextSnapshot?: unknown }
      if (typeof value.id !== "string") continue

      return {
        id: value.id,
        contextSnapshot: value.contextSnapshot,
      }
    }
  }

  return null
}

function useArkivraChatThreadRuntime(
  options: {
    adapters: RuntimeAdapters
  },
) {
  const id = useAuiState((state) => state.threadListItem.id)
  const remoteId = useAuiState((state) => state.threadListItem.remoteId)
  const aui = useAui()
  const transport = useMemo<ChatTransport<ArkivraChatMessage>>(
    () =>
      createArkivraChatTransport({
        storageKey: `arkivra-chat-resumable-stream-id:${id}`,
        getContextSnapshot: () => {
          const attachments = aui.composer().getState().attachments as readonly ComposerContextAttachment[]
          const composerSnapshot = snapshotFromComposerAttachments(attachments)
          const liveSnapshot = getLiveThreadContextSnapshot({ threadId: id, remoteId })
          const liveSnapshotKey = snapshotKey(liveSnapshot)
          const composerSnapshotKey = snapshotKey(composerSnapshot)

          if (hasComposerContextAttachments(attachments)) return composerSnapshot
          if (liveSnapshotKey.startsWith("global")) return liveSnapshot
          if (liveSnapshotKey.length > 0 && composerSnapshotKey.startsWith("global")) {
            return composerSnapshot
          }

          return liveSnapshot
        },
      }),
    [aui, id, remoteId],
  )
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

  useEffect(() => {
    const conversation = getStreamedConversation(chat.messages)
    if (conversation === null) return

    setLiveThreadContextSnapshot({
      threadId: id,
      remoteId: conversation.id,
      contextSnapshot: conversation.contextSnapshot,
    })
  }, [chat.messages, id])

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
