"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MessageSquareOff, MessageSquarePlus, Menu, X } from "lucide-react"
import { toast } from "sonner"

import { getMe } from "@/app/vaults/vaults.api"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import {
  addDocumentsToDraftContext,
  addVaultsToDraftContext,
  canUseContextSnapshot,
  contextSnapshotFromDraft,
  createEmptyDraftContext,
  draftContextFromSnapshot,
  getContextAccessMessage,
  getDraftContextSummary,
  hydrateDraftContextLabels,
  removeDocumentFromDraftContext,
  removeVaultFromDraftContext,
  type DraftChatContext,
} from "../chat-context-model"
import {
  DocumentSelectionDialog,
  useChatContextVaults,
  VaultSelectionDialog,
} from "./chat-context-dialogs"
import { ConversationList } from "./conversation-list"
import { ChatHeader } from "./chat-header"
import { MessageList } from "./message-list"
import { MessageInput } from "./message-input"
import {
  createChatConversation,
  deleteChatConversation,
  getChatConversation,
  getChatModelOptions,
  getUserUiPreferences,
  listChatConversations,
  updateChatConversationContext,
  type ChatConversation,
  type ChatConversationDetail,
  type ChatMessage,
  type ChatResponseMode,
} from "../chat.api"
import { streamChatMessage } from "../chat-stream"
import { getCachedDefaultChatResponseMode, isChatResponseMode } from "../chat-model-utils"
import {
  NEW_CHAT_DRAFT_ID,
  hasPendingAssistantMessage,
  messageSignature,
} from "../chat-utils"

export function Chat() {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [messagesByConversationId, setMessagesByConversationId] = useState<Record<string, ChatMessage[]>>({})
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingSelectedConversation, setIsLoadingSelectedConversation] = useState(false)
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(true)
  const [draftContext, setDraftContext] = useState<DraftChatContext>(() => createEmptyDraftContext())
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false)
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false)
  const [responseMode, setResponseMode] = useState<ChatResponseMode>(() =>
    getCachedDefaultChatResponseMode()
  )
  const [selectedModel, setSelectedModel] = useState("")
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState("")
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null)
  const [hasManualResponseMode, setHasManualResponseMode] = useState(false)
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const vaultsQuery = useChatContextVaults()

  const visibleConversations = useMemo(() => {
    if (selectedConversation !== NEW_CHAT_DRAFT_ID) return conversations
    const now = new Date().toISOString()
    const draftConversation: ChatConversation = {
      id: NEW_CHAT_DRAFT_ID,
      title: "New chat",
      scope: "global",
      vaultId: null,
      documentId: null,
      contextSnapshot: contextSnapshotFromDraft(draftContext),
      userId: null,
      createdAt: now,
      updatedAt: now,
    }
    return [draftConversation, ...conversations]
  }, [conversations, draftContext, selectedConversation])

  const currentConversation = visibleConversations.find(
    (conversation) => conversation.id === selectedConversation
  ) ?? null
  const currentMessages = useMemo(
    () => (selectedConversation ? messagesByConversationId[selectedConversation] ?? [] : []),
    [messagesByConversationId, selectedConversation]
  )
  const isDraftConversation = selectedConversation === NEW_CHAT_DRAFT_ID
  const contextAvailability =
    currentConversation && currentConversation.id !== NEW_CHAT_DRAFT_ID
      ? (currentConversation as ChatConversationDetail).contextAvailability
      : undefined
  const isContextReadOnly = contextAvailability?.readOnly === true
  const isContextLocked =
    Boolean(currentConversation) &&
    !isDraftConversation &&
    currentMessages.length > 0
  const baseDisplayedContext =
    currentConversation && !isDraftConversation && isContextLocked
      ? draftContextFromSnapshot(currentConversation.contextSnapshot)
      : draftContext
  const hydratedDraftContext = hydrateDraftContextLabels({
    context: baseDisplayedContext,
    vaults: vaultsQuery.vaults,
  })
  const activeContextSnapshot =
    currentConversation && !isDraftConversation && isContextLocked
      ? currentConversation.contextSnapshot
      : contextSnapshotFromDraft(hydratedDraftContext)
  const aiAccessByVaultId = useMemo(() => {
    const access = new Map<string, "none" | "full">()
    for (const vault of vaultsQuery.vaults) {
      access.set(vault.id, vault.aiAccessLevel)
    }
    return access
  }, [vaultsQuery.vaults])
  const hasFullAiVault = vaultsQuery.vaults.some((vault) => vault.aiAccessLevel === "full")
  const canUseSelectedContext =
    vaultsQuery.isLoading ||
    canUseContextSnapshot({
      snapshot: activeContextSnapshot,
      aiAccessByVaultId,
      hasFullAiVault,
    })
  const contextSummary = getDraftContextSummary(hydratedDraftContext)
  const contextLabel = contextSummary.label
  const resolvedSelectedModel =
    selectedModel && availableModels.includes(selectedModel)
      ? selectedModel
      : defaultModel && availableModels.includes(defaultModel)
        ? defaultModel
        : ""
  const hasLoadedChatModels = !isLoadingModels && modelOptionsError === null
  const hasUsableChatModels = !hasLoadedChatModels || resolvedSelectedModel.length > 0
  const isStreaming = streamingConversationId !== null
  const composerDisabled =
    isLoadingSelectedConversation ||
    isStreaming ||
    !aiFeaturesEnabled ||
    isContextReadOnly ||
    !canUseSelectedContext ||
    !hasUsableChatModels

  const refreshConversations = useCallback(async () => {
    const result = await listChatConversations()
    setConversations(result.conversations)
  }, [])

  const loadConversation = useCallback(async (chatId: string, options?: { quiet?: boolean }) => {
    if (!options?.quiet) setIsLoadingSelectedConversation(true)
    try {
      const result = await getChatConversation({ chatId })
      setConversations((current) =>
        upsertConversation(current, result.conversation)
      )
      setMessagesByConversationId((current) => ({
        ...current,
        [chatId]: result.conversation.messages,
      }))
      setDraftContext(draftContextFromSnapshot(result.conversation.contextSnapshot))
      return result.conversation
    } finally {
      if (!options?.quiet) setIsLoadingSelectedConversation(false)
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    async function loadInitialData() {
      setIsLoadingConversations(true)
      setIsLoadingModels(true)
      setModelOptionsError(null)

      try {
        const [conversationResult, modelResult, preferencesResult, meResult] = await Promise.all([
          listChatConversations(),
          getChatModelOptions(),
          getUserUiPreferences().catch(() => ({ preferences: {} as { defaultChatAnswerMode?: ChatResponseMode } })),
          getMe().catch(() => ({ aiFeaturesEnabled: true, canCreateVault: false })),
        ])
        if (!isCurrent) return

        setConversations(conversationResult.conversations)
        setAvailableModels(modelResult.options.models)
        setDefaultModel(modelResult.options.defaultModel)
        setAiFeaturesEnabled(meResult.aiFeaturesEnabled !== false)

        const defaultChatAnswerMode = preferencesResult.preferences.defaultChatAnswerMode
        if (!hasManualResponseMode && isChatResponseMode(defaultChatAnswerMode)) {
          setResponseMode(defaultChatAnswerMode)
        }
      } catch (error) {
        if (!isCurrent) return
        toast.error(error instanceof Error ? error.message : "Could not load chat.")
      } finally {
        if (isCurrent) {
          setIsLoadingConversations(false)
          setIsLoadingModels(false)
        }
      }
    }

    void loadInitialData()

    return () => {
      isCurrent = false
    }
  }, [hasManualResponseMode])

  useEffect(() => {
    if (!selectedConversation || selectedConversation === NEW_CHAT_DRAFT_ID) return
    void loadConversation(selectedConversation)
  }, [loadConversation, selectedConversation])

  useEffect(() => {
    if (!selectedConversation || selectedConversation === NEW_CHAT_DRAFT_ID) return
    if (isStreaming) return
    if (!hasPendingAssistantMessage(currentMessages)) return

    const intervalId = window.setInterval(() => {
      void loadConversation(selectedConversation, { quiet: true })
    }, 1500)

    return () => window.clearInterval(intervalId)
  }, [currentMessages, isStreaming, loadConversation, selectedConversation])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setIsSidebarOpen(false)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    return () => abortControllerRef.current?.abort()
  }, [])

  function handleCreateConversation() {
    abortControllerRef.current?.abort()
    setSelectedConversation(NEW_CHAT_DRAFT_ID)
    setDraftContext(createEmptyDraftContext())
    setMessagesByConversationId((current) => ({ ...current, [NEW_CHAT_DRAFT_ID]: [] }))
    setIsSidebarOpen(false)
  }

  function handleSelectConversation(chatId: string) {
    if (chatId === selectedConversation) return
    abortControllerRef.current?.abort()
    setSelectedConversation(chatId)
    setIsSidebarOpen(false)
  }

  async function handleDeleteConversation(chatId: string) {
    if (chatId === NEW_CHAT_DRAFT_ID) {
      setSelectedConversation(null)
      setDraftContext(createEmptyDraftContext())
      return
    }

    try {
      await deleteChatConversation({ chatId })
      setConversations((current) => current.filter((conversation) => conversation.id !== chatId))
      setMessagesByConversationId((current) => {
        const next = { ...current }
        delete next[chatId]
        return next
      })
      if (selectedConversation === chatId) {
        setSelectedConversation(null)
        setDraftContext(createEmptyDraftContext())
      }
      toast.success("Conversation deleted.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete conversation.")
    }
  }

  async function applyContextChange(nextContext: DraftChatContext) {
    const hydratedNextContext = hydrateDraftContextLabels({
      context: nextContext,
      vaults: vaultsQuery.vaults,
    })

    if (isContextLocked) {
      const shouldFork = window.confirm(
        "This conversation already has messages. Create a new chat with the changed context?"
      )
      if (!shouldFork) return

      try {
        const result = await createChatConversation({
          contextSnapshot: contextSnapshotFromDraft(hydratedNextContext),
          title: currentConversation?.title,
        })
        setDraftContext(hydratedNextContext)
        setSelectedConversation(result.conversation.id)
        setConversations((current) => upsertConversation(current, result.conversation))
        setMessagesByConversationId((current) => ({
          ...current,
          [result.conversation.id]: [],
        }))
        await refreshConversations()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create a new chat.")
      }
      return
    }

    setDraftContext(hydratedNextContext)
    if (currentConversation && !isDraftConversation) {
      try {
        const result = await updateChatConversationContext({
          chatId: currentConversation.id,
          contextSnapshot: contextSnapshotFromDraft(hydratedNextContext),
        })
        setConversations((current) => upsertConversation(current, result.conversation))
        await refreshConversations()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update conversation context.")
      }
    }
  }

  async function handleSendMessage(content: string) {
    const trimmedContent = content.trim()
    if (!trimmedContent || isStreaming) return
    if (!aiFeaturesEnabled) {
      toast.error("AI features are disabled.")
      return
    }
    if (!resolvedSelectedModel) {
      toast.error("No chat models are available from the configured chat providers.")
      return
    }
    if (!canUseSelectedContext) {
      toast.error(getContextAccessMessage(activeContextSnapshot))
      return
    }

    let chatId = selectedConversation && selectedConversation !== NEW_CHAT_DRAFT_ID
      ? selectedConversation
      : ""
    let conversation = currentConversation

    try {
      if (!chatId) {
        const result = await createChatConversation({
          contextSnapshot: contextSnapshotFromDraft(hydratedDraftContext),
          title: trimmedContent,
        })
        conversation = result.conversation
        chatId = result.conversation.id
        setSelectedConversation(chatId)
        setConversations((current) => upsertConversation(current, result.conversation))
      }

      const now = new Date().toISOString()
      const userMessage: ChatMessage = {
        id: `msg-${crypto.randomUUID()}`,
        role: "user",
        metadata: {
          conversationId: chatId,
          createdAt: now,
          updatedAt: now,
          ...(conversation?.vaultId !== undefined ? { vaultId: conversation.vaultId } : {}),
          ...(conversation?.documentId !== undefined ? { documentId: conversation.documentId } : {}),
          ...(conversation?.scope ? { scope: conversation.scope } : {}),
        },
        parts: [{ type: "text", text: trimmedContent }],
      }
      const persistedMessages = chatId === selectedConversation ? currentMessages : []
      const nextMessages = [...persistedMessages, userMessage]
      setMessagesByConversationId((current) => ({
        ...current,
        [chatId]: nextMessages,
        [NEW_CHAT_DRAFT_ID]: [],
      }))
      setConversations((current) => {
        const existingConversation =
          conversation ?? current.find((item) => item.id === chatId) ?? createLocalConversation({
            chatId,
            title: trimmedContent,
            contextSnapshot: activeContextSnapshot,
            now,
          })

        return upsertConversation(current, {
          ...existingConversation,
          id: chatId,
          title: existingConversation.title || trimmedContent,
          updatedAt: now,
        })
      })

      const abortController = new AbortController()
      abortControllerRef.current = abortController
      setStreamingConversationId(chatId)

      await streamChatMessage({
        chatId,
        messages: nextMessages,
        responseMode,
        model: resolvedSelectedModel,
        signal: abortController.signal,
        onAssistantMessage: (assistantMessage) => {
          setMessagesByConversationId((current) => {
            const existing = current[chatId] ?? nextMessages
            const withoutAssistant = existing.filter((message) => message.id !== assistantMessage.id)
            const next = [...withoutAssistant, assistantMessage]
            if (messageSignature(existing) === messageSignature(next)) return current
            return { ...current, [chatId]: next }
          })
        },
      })

      await Promise.all([
        refreshConversations(),
        loadConversation(chatId, { quiet: true }),
      ])
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.error(error instanceof Error ? error.message : "Could not send message.")
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = null
      }
      setStreamingConversationId(null)
    }
  }

  if (!aiFeaturesEnabled) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="flex h-full min-h-[600px] items-center justify-center rounded-lg border bg-background px-6 text-center">
          <div className="max-w-md">
            <MessageSquareOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h2 className="mb-2 text-lg font-semibold">AI features are disabled</h2>
            <p className="text-sm text-muted-foreground">
              Document management and keyword search remain available.
            </p>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full min-h-[600px] max-h-[calc(100vh-200px)] overflow-hidden rounded-lg border bg-background">
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <div
          className={cnSidebar(
            "fixed inset-y-0 left-0 z-50 w-100 flex-shrink-0 border-r bg-background transition-transform duration-300 ease-in-out lg:relative lg:block",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="flex items-center justify-between border-b bg-background p-4 lg:hidden">
            <h2 className="text-lg font-semibold">Chats</h2>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="New chat"
                title="New chat"
                onClick={handleCreateConversation}
                className="h-8 w-8 cursor-pointer"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(false)}
                className="cursor-pointer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ConversationList
            conversations={visibleConversations}
            messagesByConversationId={messagesByConversationId}
            selectedConversation={selectedConversation}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSelectConversation={handleSelectConversation}
            onCreateConversation={handleCreateConversation}
            onDeleteConversation={(chatId) => void handleDeleteConversation(chatId)}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-background">
          <div className="flex h-16 items-center border-b bg-background px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(true)}
              className="mr-2 cursor-pointer lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <ChatHeader
                conversation={currentConversation}
                contextLabel={contextLabel}
                contextLocked={isContextLocked}
                responseMode={responseMode}
                modelOptions={availableModels}
                selectedModel={resolvedSelectedModel}
                isLoadingModels={isLoadingModels}
                modelOptionsError={modelOptionsError}
                disabled={composerDisabled}
                onResponseModeChange={(nextValue) => {
                  setHasManualResponseMode(true)
                  setResponseMode(nextValue)
                }}
                onSelectedModelChange={setSelectedModel}
                onDeleteConversation={
                  currentConversation
                    ? () => void handleDeleteConversation(currentConversation.id)
                    : undefined
                }
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {isLoadingConversations ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Loading chats...
              </div>
            ) : selectedConversation ? (
              <>
                {!canUseSelectedContext || isContextReadOnly || (!hasUsableChatModels && hasLoadedChatModels) ? (
                  <ChatWarning
                    message={
                      isContextReadOnly
                        ? contextAvailability?.message ?? "This conversation is available as read-only history."
                        : !hasUsableChatModels && hasLoadedChatModels
                          ? "No chat models are available from the configured chat providers."
                          : getContextAccessMessage(activeContextSnapshot)
                    }
                  />
                ) : null}
                <MessageList
                  messages={currentMessages}
                  isLoading={isLoadingSelectedConversation}
                  onQuickReplySelect={(reply) => void handleSendMessage(reply)}
                />
                <MessageInput
                  onSendMessage={(message) => void handleSendMessage(message)}
                  disabled={composerDisabled}
                  placeholder="Ask across your documents..."
                  context={hydratedDraftContext}
                  contextLocked={isContextLocked}
                  onAddVaults={() => setIsVaultDialogOpen(true)}
                  onAddDocuments={() => setIsDocumentDialogOpen(true)}
                  onRemoveVault={(vault) =>
                    void applyContextChange(removeVaultFromDraftContext(hydratedDraftContext, vault.vaultId))
                  }
                  onRemoveDocument={(document) =>
                    void applyContextChange(removeDocumentFromDraftContext(hydratedDraftContext, document))
                  }
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <h3 className="mb-2 text-lg font-semibold">Welcome to Chat</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Start a new conversation to ask questions across your documents.
                  </p>
                  <Button type="button" onClick={handleCreateConversation}>
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    New chat
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <VaultSelectionDialog
        open={isVaultDialogOpen}
        vaults={vaultsQuery.vaults}
        isLoading={vaultsQuery.isLoading}
        error={vaultsQuery.error}
        onOpenChange={setIsVaultDialogOpen}
        onConfirm={(vaults) =>
          void applyContextChange(addVaultsToDraftContext(hydratedDraftContext, vaults))
        }
      />
      <DocumentSelectionDialog
        open={isDocumentDialogOpen}
        context={hydratedDraftContext}
        vaults={vaultsQuery.vaults}
        onOpenChange={setIsDocumentDialogOpen}
        onConfirm={(documents) =>
          void applyContextChange(addDocumentsToDraftContext(hydratedDraftContext, documents))
        }
      />
    </TooltipProvider>
  )
}

function ChatWarning({ message }: { message: string }) {
  return (
    <div className="border-b bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function upsertConversation(
  conversations: ChatConversation[],
  conversation: ChatConversation
) {
  return [
    conversation,
    ...conversations.filter((item) => item.id !== conversation.id),
  ].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
}

function createLocalConversation({
  chatId,
  title,
  contextSnapshot,
  now,
}: {
  chatId: string
  title: string
  contextSnapshot: ChatConversation["contextSnapshot"]
  now: string
}): ChatConversation {
  const scopeValues =
    contextSnapshot.type === "document"
      ? { scope: "document" as const, vaultId: contextSnapshot.vaultId, documentId: contextSnapshot.documentId }
      : contextSnapshot.type === "vault"
        ? { scope: "vault" as const, vaultId: contextSnapshot.vaultId, documentId: null }
        : { scope: "global" as const, vaultId: null, documentId: null }

  return {
    id: chatId,
    title,
    contextSnapshot,
    userId: null,
    createdAt: now,
    updatedAt: now,
    ...scopeValues,
  }
}

function cnSidebar(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}
