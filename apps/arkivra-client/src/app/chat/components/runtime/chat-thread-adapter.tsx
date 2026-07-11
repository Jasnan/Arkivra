"use client"

import { useMemo, type PropsWithChildren } from "react"
import {
  RuntimeAdapterProvider,
  useAui,
  type MessageFormatItem,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ThreadMessage,
} from "@assistant-ui/react"

import type { ArkivraChatMessage } from "@/app/chat/components/runtime/chat-runtime.helpers"
import { fetchJson } from "@/lib/api"

const MAX_TITLE_LENGTH = 48
const DEFAULT_CHAT_TITLE = "New chat"

type ChatConversation = {
  id: string
  title: string
  contextSnapshot?: unknown
  createdAt: string
  updatedAt: string
}

type ChatConversationDetail = ChatConversation & {
  messages: ArkivraChatMessage[]
}

type ChatListResponse = {
  conversations: ChatConversation[]
}

type ChatDetailResponse = {
  conversation: ChatConversationDetail
}

type ChatCreateResponse = {
  conversation: ChatConversation
}

type TitleStream = Awaited<ReturnType<RemoteThreadListAdapter["generateTitle"]>>

function getThreadMessageText(message: ThreadMessage) {
  return message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function getFirstUserMessageText(messages: readonly ThreadMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")
  return firstUserMessage ? getThreadMessageText(firstUserMessage) : ""
}

function toChatTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return DEFAULT_CHAT_TITLE
  if (normalized.length <= MAX_TITLE_LENGTH) return normalized

  return `${normalized.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}...`
}

function sortConversationsByUpdatedAt(conversations: readonly ChatConversation[]) {
  return [...conversations].sort((left, right) => (
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
    Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
    right.id.localeCompare(left.id)
  ))
}

function createTitleStream(title: string): TitleStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: "part-start",
        path: [],
        part: { type: "text" },
      })
      controller.enqueue({
        type: "text-delta",
        path: [0],
        textDelta: title,
      })
      controller.enqueue({
        type: "part-finish",
        path: [0],
      })
      controller.close()
    },
  }) as TitleStream
}

function toThreadMetadata(conversation: ChatConversation) {
  return {
    status: "regular" as const,
    remoteId: conversation.id,
    externalId: conversation.id,
    title: conversation.title,
    custom: {
      contextSnapshot: conversation.contextSnapshot,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
  }
}

function createHistoryAdapter(aui: ReturnType<typeof useAui>): ThreadHistoryAdapter {
  return {
    async load() {
      return { headId: null, messages: [] }
    },
    async append() {},
    withFormat<TMessage>() {
      return {
        async load() {
          const { id, remoteId, externalId } = aui.threadListItem().getState()
          const persistedChatId = remoteId ?? externalId ?? (id.startsWith("cht_") ? id : undefined)
          if (!persistedChatId) return { messages: [] }

          const { conversation } = await fetchJson<ChatDetailResponse>(`/api/chats/${persistedChatId}`)
          return {
            headId: conversation.messages.at(-1)?.id ?? null,
            messages: conversation.messages.map((message, index): MessageFormatItem<TMessage> => ({
              parentId: index === 0 ? null : conversation.messages[index - 1]?.id ?? null,
              message: message as TMessage,
            })),
          }
        },
        async append() {},
        async update() {},
      }
    },
  }
}

function ArkivraThreadProvider({ children }: PropsWithChildren) {
  const aui = useAui()
  const history = useMemo(() => createHistoryAdapter(aui), [aui])

  return <RuntimeAdapterProvider adapters={{ history }}>{children}</RuntimeAdapterProvider>
}

export function createArkivraThreadListAdapter({
  ephemeralChatId,
}: {
  ephemeralChatId?: string | null
} = {}): RemoteThreadListAdapter {
  return {
    async list() {
      const [{ conversations }, ephemeralConversation] = await Promise.all([
        fetchJson<ChatListResponse>("/api/chats"),
        ephemeralChatId
          ? fetchJson<ChatDetailResponse>(`/api/chats/${encodeURIComponent(ephemeralChatId)}`)
              .then(({ conversation }) => conversation)
              .catch(() => null)
          : Promise.resolve(null),
      ])
      const sortedConversations = sortConversationsByUpdatedAt(conversations)

      if (!ephemeralConversation) {
        return { threads: sortedConversations.map(toThreadMetadata) }
      }

      return {
        threads: [
          ephemeralConversation,
          ...sortedConversations.filter((conversation) => conversation.id !== ephemeralConversation.id),
        ].map(toThreadMetadata),
      }
    },
    async initialize() {
      const { conversation } = await fetchJson<ChatCreateResponse>("/api/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contextSnapshot: { type: "global", vaultIds: [] } }),
      })

      return { remoteId: conversation.id, externalId: conversation.id }
    },
    async rename(remoteId, newTitle) {
      await fetchJson<ChatCreateResponse>(`/api/chats/${remoteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      })
    },
    async archive(remoteId) {
      await fetchJson<void>(`/api/chats/${remoteId}`, { method: "DELETE" })
    },
    async unarchive() {},
    async delete(remoteId) {
      await fetchJson<void>(`/api/chats/${remoteId}`, { method: "DELETE" })
    },
    async fetch(remoteId) {
      const { conversation } = await fetchJson<ChatDetailResponse>(`/api/chats/${remoteId}`)
      return toThreadMetadata(conversation)
    },
    async generateTitle(remoteId, messages) {
      const titleFromLiveMessages = toChatTitle(getFirstUserMessageText(messages))

      if (titleFromLiveMessages !== DEFAULT_CHAT_TITLE) {
        await fetchJson<ChatCreateResponse>(`/api/chats/${remoteId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: titleFromLiveMessages }),
        })

        return createTitleStream(titleFromLiveMessages)
      }

      const { conversation } = await fetchJson<ChatDetailResponse>(`/api/chats/${remoteId}`)
      const title = toChatTitle(conversation.title)

      return createTitleStream(title)
    },
    unstable_Provider: ArkivraThreadProvider,
  }
}
