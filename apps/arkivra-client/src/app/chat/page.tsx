"use client"

import { useEffect, useRef, useState } from "react"
import { useAui, useAuiState } from "@assistant-ui/react"
import { useBlocker, useLocation, useNavigate, useParams } from "react-router-dom"

import { BaseLayout } from "@/components/layouts/base-layout"
import { ChatCitationViewerDialog } from "@/app/chat/components/chat-citation-viewer-dialog"
import { Base } from "@/app/chat/components/examples/base"
import { ChatRuntimeProvider } from "@/app/chat/components/runtime/chat-runtime-provider"
import { restoreChatThreadFromUrl } from "@/app/chat/components/runtime/chat-url-thread-restore"
import { BaseConfigProvider } from "@/app/chat/lib/base/config-provider"
import { defaultBaseConfig } from "@/app/chat/lib/base/defaults"
import { getChatModelOptions } from "@/app/chat/lib/chat-model-options"
import { discardChatDraftIfEmpty } from "@/app/chat/lib/chat-draft"
import { shouldConfirmChatDiscard } from "@/app/chat/lib/chat-discard-guard"
import {
  draftContextFromAttachments,
  hasDraftContext,
  type ComposerContextAttachment,
} from "@/app/chat/lib/chat-context-model"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchJson } from "@/lib/api"

type ChatAvailability = "loading" | "available" | "disabled" | "needs-setup" | "access-denied"

interface ChatMeResponse {
  aiFeaturesEnabled: boolean
  canUseAI?: boolean
}

function getChatPath(chatId?: string) {
  return chatId ? `/chat/${encodeURIComponent(chatId)}` : "/chat"
}

function normalizeChatId(chatId: string | undefined) {
  const normalized = chatId?.trim()
  return normalized ? normalized : undefined
}

function getEphemeralChatId(state: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null
  const chatId = (state as { ephemeralChatId?: unknown }).ephemeralChatId
  return typeof chatId === "string" && chatId.trim().length > 0 ? chatId : null
}

const pendingDraftCleanup = new Map<string, ReturnType<typeof setTimeout>>()

function EphemeralChatDraftCleanup() {
  const location = useLocation()
  const ephemeralChatId = getEphemeralChatId(location.state)

  useEffect(() => {
    if (!ephemeralChatId) return

    const pendingCleanup = pendingDraftCleanup.get(ephemeralChatId)
    if (pendingCleanup) {
      clearTimeout(pendingCleanup)
      pendingDraftCleanup.delete(ephemeralChatId)
    }

    return () => {
      const timeout = setTimeout(() => {
        pendingDraftCleanup.delete(ephemeralChatId)
        void discardChatDraftIfEmpty(ephemeralChatId).catch((error: unknown) => {
          console.warn("[Arkivra chat] failed to discard empty chat draft", error)
        })
      }, 0)
      pendingDraftCleanup.set(ephemeralChatId, timeout)
    }
  }, [ephemeralChatId])

  return null
}

function ChatDiscardGuard() {
  const { chatId: chatIdParam } = useParams()
  const chatId = normalizeChatId(chatIdParam)
  const attachments = useAuiState(
    (state) => state.composer.attachments as readonly ComposerContextAttachment[],
  )
  const hasConversation = useAuiState((state) => state.thread.messages.length > 0)
  const isThreadLoading = useAuiState((state) => state.thread.isLoading)
  const hasNonGlobalContext = hasDraftContext(draftContextFromAttachments(attachments))
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    shouldConfirmChatDiscard({
      hasConversation: hasConversation || isThreadLoading,
      hasNonGlobalContext,
      hasChatId: Boolean(chatId),
      currentPathname: currentLocation.pathname,
      nextPathname: nextLocation.pathname,
    }),
  )

  useEffect(() => {
    if (hasConversation || isThreadLoading || (!hasNonGlobalContext && !chatId)) return

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => window.removeEventListener("beforeunload", warnBeforeUnload)
  }, [chatId, hasConversation, hasNonGlobalContext, isThreadLoading])

  function keepChat() {
    if (blocker.state === "blocked") blocker.reset()
  }

  async function discardChat() {
    if (blocker.state !== "blocked") return

    if (chatId) {
      try {
        await discardChatDraftIfEmpty(chatId)
      } catch (error) {
        console.warn("[Arkivra chat] failed to discard empty chat draft", error)
      }
    }

    blocker.proceed()
  }

  return (
    <Dialog
      open={blocker.state === "blocked"}
      onOpenChange={(open) => {
        if (!open) keepChat()
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Discard this chat?</DialogTitle>
          <DialogDescription>
            This chat has no messages yet. Leaving now will discard it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={keepChat}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={() => void discardChat()}>
            Discard chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
  const isEphemeralDraft = getEphemeralChatId(location.state) === chatId
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
    const restoreTask = isEphemeralDraft
      ? Promise.resolve(aui.threads().switchToThread(chatId))
      : restoreChatThreadFromUrl({
          chatId,
          threads: aui.threads(),
          onReloadError: (error) => {
            console.warn("[Arkivra chat] failed to refresh chat thread list after URL restore", error)
          },
        })

    void restoreTask
      .catch(() => {
        if (pendingUrlChatIdRef.current === chatId) {
          pendingUrlChatIdRef.current = undefined
        }

        navigate(getChatPath(), { replace: true })
      })
  }, [aui, chatId, isEphemeralDraft, navigate, persistedChatId])

  useEffect(() => {
    if (pendingUrlChatIdRef.current && pendingUrlChatIdRef.current !== persistedChatId) return

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
  const location = useLocation()
  const ephemeralChatId = getEphemeralChatId(location.state)
  const [chatAvailability, setChatAvailability] = useState<ChatAvailability>("loading")

  useEffect(() => {
    const controller = new AbortController()
    let ignore = false

    async function loadChatAvailability() {
      try {
        const me = await fetchJson<ChatMeResponse>("/api/me", { signal: controller.signal })

        if (!me.aiFeaturesEnabled) {
          if (!ignore) setChatAvailability("disabled")
          return
        }

        if (me.canUseAI === false) {
          if (!ignore) setChatAvailability("access-denied")
          return
        }

        const result = await getChatModelOptions()
        if (!ignore) {
          setChatAvailability(result.options.models.length > 0 ? "available" : "needs-setup")
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        if (!ignore) setChatAvailability("needs-setup")
      }
    }

    void loadChatAvailability()
    return () => {
      ignore = true
      controller.abort()
    }
  }, [])

  return (
    <BaseLayout
      hideHeaderSearch
      contentClassName="overflow-hidden [&>div]:flex-1 [&>div>div]:flex-1"
    >
      <div className="-my-4 flex min-h-0 flex-1 overflow-hidden md:-my-6">
        <BaseConfigProvider value={defaultBaseConfig}>
          <ChatRuntimeProvider ephemeralChatId={ephemeralChatId}>
            <ChatUrlSync />
            <EphemeralChatDraftCleanup />
            <ChatDiscardGuard />
            <Base chatAvailability={chatAvailability} />
            <ChatCitationViewerDialog />
          </ChatRuntimeProvider>
        </BaseConfigProvider>
      </div>
    </BaseLayout>
  )
}
