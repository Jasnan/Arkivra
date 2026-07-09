"use client"

import { useEffect, useRef } from "react"
import { useAui, useAuiState } from "@assistant-ui/react"
import { useLocation, useNavigate, useParams } from "react-router-dom"

import { BaseLayout } from "@/components/layouts/base-layout"
import { ChatCitationViewerDialog } from "@/app/chat/components/chat-citation-viewer-dialog"
import { Base } from "@/app/chat/components/examples/base"
import { ChatRuntimeProvider } from "@/app/chat/components/runtime/chat-runtime-provider"
import { restoreChatThreadFromUrl } from "@/app/chat/components/runtime/chat-url-thread-restore"
import { BaseConfigProvider } from "@/app/chat/lib/base/config-provider"
import { defaultBaseConfig } from "@/app/chat/lib/base/defaults"

function getChatPath(chatId?: string) {
  return chatId ? `/chat/${encodeURIComponent(chatId)}` : "/chat"
}

function normalizeChatId(chatId: string | undefined) {
  const normalized = chatId?.trim()
  return normalized ? normalized : undefined
}

function getPersistedChatId({
  id,
  remoteId,
  externalId,
}: {
  id?: string
  remoteId?: string
  externalId?: string
}) {
  return remoteId ?? externalId ?? (id?.startsWith("cht_") ? id : undefined)
}

function ChatUrlSync() {
  const { chatId: chatIdParam } = useParams()
  const chatId = normalizeChatId(chatIdParam)
  const location = useLocation()
  const navigate = useNavigate()
  const aui = useAui()
  const threadId = useAuiState((state) => state.threadListItem.id)
  const remoteId = useAuiState((state) => state.threadListItem.remoteId)
  const externalId = useAuiState((state) => state.threadListItem.externalId)
  const persistedChatId = getPersistedChatId({ id: threadId, remoteId, externalId })
  const lastAppliedUrlChatIdRef = useRef<string | undefined>(undefined)
  const pendingUrlChatIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!chatId) {
      lastAppliedUrlChatIdRef.current = undefined
      pendingUrlChatIdRef.current = undefined
      return
    }

    if (lastAppliedUrlChatIdRef.current === chatId) return
    lastAppliedUrlChatIdRef.current = chatId

    if (persistedChatId === chatId) return

    pendingUrlChatIdRef.current = chatId
    void restoreChatThreadFromUrl({
      chatId,
      threads: aui.threads(),
      onReloadError: (error) => {
        console.warn("[Arkivra chat] failed to refresh chat thread list after URL restore", error)
      },
    })
      .catch(() => {
        if (pendingUrlChatIdRef.current === chatId) {
          pendingUrlChatIdRef.current = undefined
        }

        navigate(getChatPath(), { replace: true })
      })
  }, [aui, chatId, navigate, persistedChatId])

  useEffect(() => {
    if (persistedChatId) {
      if (pendingUrlChatIdRef.current === persistedChatId) {
        pendingUrlChatIdRef.current = undefined
      }

      if (chatId !== persistedChatId) {
        const nextPath = getChatPath(persistedChatId)
        lastAppliedUrlChatIdRef.current = persistedChatId
        if (location.pathname !== nextPath) {
          navigate(nextPath, { replace: true })
        }
      }

      return
    }

    if (chatId && !pendingUrlChatIdRef.current) {
      lastAppliedUrlChatIdRef.current = undefined
      if (location.pathname !== getChatPath()) {
        navigate(getChatPath(), { replace: true })
      }
    }
  }, [chatId, location.pathname, navigate, persistedChatId])

  return null
}

export default function ChatPage() {
  return (
    <BaseLayout
      hideHeaderSearch
      contentClassName="overflow-hidden [&>div]:flex-1 [&>div>div]:flex-1"
    >
      <div className="flex min-h-0 flex-1 overflow-hidden px-4 lg:px-6">
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
          <BaseConfigProvider value={defaultBaseConfig}>
            <ChatRuntimeProvider>
              <ChatUrlSync />
              <Base />
              <ChatCitationViewerDialog />
            </ChatRuntimeProvider>
          </BaseConfigProvider>
        </div>
      </div>
    </BaseLayout>
  )
}
