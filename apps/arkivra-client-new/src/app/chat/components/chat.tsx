"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MessageSquareOff, MessageSquarePlus, Menu, X } from "lucide-react"
import { toast } from "sonner"

import { getMe } from "@/app/vaults/vaults.api"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
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
  normalizeDraftContext,
  removeDocumentFromDraftContext,
  removeVaultFromDraftContext,
  type DraftChatContext,
} from "../chat-context-model"
import {
  DocumentSelectionDialog,
  useChatContextVaults,
  VaultSelectionDialog,
} from "./chat-context-dialogs"
import {
  AssistantChatRuntimeProvider,
  type AssistantChatRuntimeHandle,
  type AssistantChatRuntimeState,
} from "./assistant-chat-runtime"
import { AssistantChatThread } from "./assistant-chat-thread"
import { ConversationForkDialog } from "./chat-context-fork-dialog"
import { ConversationList } from "./conversation-list"
import { ChatHeader } from "./chat-header"
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
import { getCachedDefaultChatResponseMode, isChatResponseMode } from "../chat-model-utils"
import {
  NEW_CHAT_DRAFT_ID,
  getRuntimeConversationId,
  hasPendingAssistantMessage,
  messageSignature,
  shouldUseLocalRuntimeMessages,
} from "../chat-utils"

interface ChatProps {
  selectedConversationId?: string
  onConversationCreated?: (chatId: string) => void
  onConversationSelected?: (chatId: string) => void
  onConversationCleared?: () => void
}

export function Chat({
  selectedConversationId,
  onConversationCreated,
  onConversationSelected,
  onConversationCleared,
}: ChatProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [messagesByConversationId, setMessagesByConversationId] = useState<Record<string, ChatMessage[]>>({})
  const [selectedConversation, setSelectedConversation] = useState<string | null>(selectedConversationId ?? null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingSelectedConversation, setIsLoadingSelectedConversation] = useState(false)
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(true)
  const [draftContext, setDraftContext] = useState<DraftChatContext>(() => createEmptyDraftContext())
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false)
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false)
  const [pendingForkContext, setPendingForkContext] = useState<DraftChatContext | null>(null)
  const [isForkDialogOpen, setIsForkDialogOpen] = useState(false)
  const [isForkingContext, setIsForkingContext] = useState(false)
  const [composerValue, setComposerValue] = useState("")
  const [responseMode, setResponseMode] = useState<ChatResponseMode>(() =>
    getCachedDefaultChatResponseMode()
  )
  const [selectedModel, setSelectedModel] = useState("")
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState("")
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null)
  const [runtimeState, setRuntimeState] = useState<AssistantChatRuntimeState>({
    messages: [],
    status: "ready",
  })
  const [runtimeHandle, setRuntimeHandle] = useState<AssistantChatRuntimeHandle | null>(null)
  const [localRuntimeMessagesByChatId, setLocalRuntimeMessagesByChatId] = useState<Record<string, ChatMessage[]>>({})
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previousSelectedConversationIdRef = useRef(selectedConversationId)
  const activeRuntimeChatIdRef = useRef("")
  const hasManualResponseModeRef = useRef(false)
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
  const selectedConversationMessages = selectedConversation
    ? messagesByConversationId[selectedConversation]
    : undefined
  const isDraftConversation = selectedConversation === NEW_CHAT_DRAFT_ID
  const effectiveSelectedChatId =
    selectedConversation && !isDraftConversation ? selectedConversation : ""
  const selectedLocalRuntimeMessages = effectiveSelectedChatId
    ? localRuntimeMessagesByChatId[effectiveSelectedChatId]
    : undefined
  const persistedMessages = useMemo(
    () => selectedConversationMessages ?? [],
    [selectedConversationMessages]
  )
  const currentMessages = useMemo(
    () =>
      shouldUseLocalRuntimeMessages({
        localMessages: selectedLocalRuntimeMessages,
        persistedMessages,
      })
        ? (selectedLocalRuntimeMessages ?? [])
        : persistedMessages,
    [persistedMessages, selectedLocalRuntimeMessages]
  )
  const hasRuntimeMessagesForSelectedConversation =
    runtimeState.messages.length > 0 &&
    (effectiveSelectedChatId.length === 0 ||
      getRuntimeConversationId(runtimeState.messages) === effectiveSelectedChatId ||
      activeRuntimeChatIdRef.current === effectiveSelectedChatId)
  const isStreaming =
    runtimeState.status === "submitted" ||
    runtimeState.status === "streaming" ||
    hasPendingAssistantMessage(runtimeState.messages)
  const isSavedConversationSelected = Boolean(selectedConversation) && !isDraftConversation
  const selectedConversationMessageCount = selectedConversationMessages?.length
  const isPristineSavedConversation =
    isSavedConversationSelected && selectedConversationMessageCount === 0 && !isStreaming
  const contextAvailability =
    currentConversation && currentConversation.id !== NEW_CHAT_DRAFT_ID
      ? (currentConversation as ChatConversationDetail).contextAvailability
      : undefined
  const isContextReadOnly = contextAvailability?.readOnly === true
  const isContextLocked = isSavedConversationSelected && !isPristineSavedConversation
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

  const resetComposerState = useCallback(() => {
    setComposerValue("")
    setRuntimeState({ messages: [], status: "ready" })
  }, [])

  const setLocalRuntimeMessages = useCallback((chatId: string, messages: ChatMessage[]) => {
    if (chatId.length === 0 || messages.length === 0) return

    setLocalRuntimeMessagesByChatId((current) => {
      const existing = current[chatId]
      if (existing && messageSignature(existing) === messageSignature(messages)) return current
      return { ...current, [chatId]: messages }
    })

    setMessagesByConversationId((current) => {
      const existing = current[chatId]
      if (!existing || messageSignature(existing) === messageSignature(messages)) return current
      return { ...current, [chatId]: messages }
    })
  }, [])

  const handleRuntimeStateChange = useCallback(
    (state: AssistantChatRuntimeState) => {
      const runtimeConversationId = getRuntimeConversationId(state.messages)
      const targetChatId =
        runtimeConversationId ??
        (state.status === "submitted" || state.status === "streaming"
          ? activeRuntimeChatIdRef.current
          : effectiveSelectedChatId)

      if (targetChatId && state.messages.length > 0) {
        setLocalRuntimeMessages(targetChatId, state.messages)
      }

      if (!targetChatId || targetChatId === effectiveSelectedChatId) {
        setRuntimeState(state)
      }
    },
    [effectiveSelectedChatId, setLocalRuntimeMessages]
  )

  const handleRuntimeFinish = useCallback(() => {
    void Promise.all([
      refreshConversations(),
      effectiveSelectedChatId ? loadConversation(effectiveSelectedChatId, { quiet: true }) : Promise.resolve(),
    ])
  }, [effectiveSelectedChatId, loadConversation, refreshConversations])

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
        if (!hasManualResponseModeRef.current && isChatResponseMode(defaultChatAnswerMode)) {
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
  }, [])

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
    if (selectedConversationId === previousSelectedConversationIdRef.current) return

    previousSelectedConversationIdRef.current = selectedConversationId
    if (
      selectedConversationId &&
      (selectedConversationId === selectedConversation ||
        selectedConversationId === activeRuntimeChatIdRef.current)
    ) {
      return
    }

    void runtimeHandle?.stop().catch(() => undefined)
    resetComposerState()
    setSelectedConversation((current) => {
      if (selectedConversationId === undefined && current === NEW_CHAT_DRAFT_ID) return current
      return selectedConversationId ?? null
    })
  }, [resetComposerState, runtimeHandle, selectedConversation, selectedConversationId])

  useEffect(() => {
    if (!effectiveSelectedChatId || selectedLocalRuntimeMessages === undefined) return
    if (hasPendingAssistantMessage(persistedMessages)) return
    if (persistedMessages.length < selectedLocalRuntimeMessages.length) return

    setLocalRuntimeMessagesByChatId((current) => {
      if (!(effectiveSelectedChatId in current)) return current
      const next = { ...current }
      delete next[effectiveSelectedChatId]
      return next
    })
  }, [effectiveSelectedChatId, persistedMessages, selectedLocalRuntimeMessages])

  function handleCreateConversation() {
    void runtimeHandle?.stop().catch(() => undefined)
    setSelectedConversation(NEW_CHAT_DRAFT_ID)
    setDraftContext(createEmptyDraftContext())
    resetComposerState()
    setMessagesByConversationId((current) => ({ ...current, [NEW_CHAT_DRAFT_ID]: [] }))
    setIsSidebarOpen(false)
    onConversationCleared?.()
  }

  function handleSelectConversation(chatId: string) {
    if (chatId === selectedConversation) return
    void runtimeHandle?.stop().catch(() => undefined)
    setSelectedConversation(chatId)
    resetComposerState()
    setIsSidebarOpen(false)
    onConversationSelected?.(chatId)
  }

  async function handleDeleteConversation(chatId: string) {
    if (chatId === NEW_CHAT_DRAFT_ID) {
      setSelectedConversation(null)
      setDraftContext(createEmptyDraftContext())
      resetComposerState()
      onConversationCleared?.()
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
        void runtimeHandle?.stop().catch(() => undefined)
        setSelectedConversation(null)
        setDraftContext(createEmptyDraftContext())
        resetComposerState()
        onConversationCleared?.()
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
    if (draftContextsEqual(hydratedDraftContext, hydratedNextContext)) return

    if (isContextLocked) {
      setPendingForkContext(hydratedNextContext)
      setIsForkDialogOpen(true)
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

  function handleForkDialogOpenChange(open: boolean) {
    setIsForkDialogOpen(open)
    if (!open) {
      setPendingForkContext(null)
    }
  }

  async function handleConfirmFork() {
    if (pendingForkContext === null) {
      setIsForkDialogOpen(false)
      return
    }

    try {
      setIsForkingContext(true)
      const result = await createChatConversation({
        contextSnapshot: contextSnapshotFromDraft(pendingForkContext),
        title: composerValue.trim() || currentConversation?.title,
      })
      const chatId = result.conversation.id

      setDraftContext(pendingForkContext)
      setSelectedConversation(chatId)
      setIsForkDialogOpen(false)
      setPendingForkContext(null)
      setConversations((current) => upsertConversation(current, result.conversation))
      setMessagesByConversationId((current) => ({
        ...current,
        [chatId]: [],
      }))
      onConversationCreated?.(chatId)
      await refreshConversations()
      window.setTimeout(() => textareaRef.current?.focus(), 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create a new chat.")
    } finally {
      setIsForkingContext(false)
    }
  }

  const resolveRuntimeChatId = useCallback(
    async ({ content }: { content: string }) => {
      if (effectiveSelectedChatId.length > 0) {
        activeRuntimeChatIdRef.current = effectiveSelectedChatId
        return effectiveSelectedChatId
      }

      const title = content.trim() || "New chat"
      const result = await createChatConversation({
        contextSnapshot: contextSnapshotFromDraft(hydratedDraftContext),
        title,
      })
      const chatId = result.conversation.id
      activeRuntimeChatIdRef.current = chatId
      setSelectedConversation(chatId)
      setConversations((current) => upsertConversation(current, result.conversation))
      setMessagesByConversationId((current) => ({
        ...current,
        [chatId]: [],
        [NEW_CHAT_DRAFT_ID]: [],
      }))
      onConversationCreated?.(chatId)
      await refreshConversations()
      return chatId
    },
    [effectiveSelectedChatId, hydratedDraftContext, onConversationCreated, refreshConversations]
  )

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
    if (runtimeHandle === null) {
      toast.error("Chat is still starting.")
      return
    }

    activeRuntimeChatIdRef.current = effectiveSelectedChatId

    try {
      await runtimeHandle.sendText(trimmedContent)
      setComposerValue("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send message.")
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
      <div className="flex h-full min-h-0 w-full overflow-hidden rounded-lg border bg-background">
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <div
          className={cnSidebar(
            "fixed inset-y-0 left-0 z-50 w-100 flex-shrink-0 border-r bg-background transition-transform duration-300 ease-in-out lg:relative lg:block lg:border-r-0",
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
            isLoading={isLoadingConversations}
            onSearchQueryChange={setSearchQuery}
            onSelectConversation={handleSelectConversation}
            onCreateConversation={handleCreateConversation}
            onDeleteConversation={(chatId) => void handleDeleteConversation(chatId)}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col border-l bg-background">
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
                  hasManualResponseModeRef.current = true
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

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {isLoadingConversations ? (
              <ChatPaneSkeleton />
            ) : selectedConversation ? (
              <AssistantChatRuntimeProvider
                chatId={effectiveSelectedChatId}
                messages={currentMessages}
                disabled={composerDisabled}
                responseMode={responseMode}
                model={resolvedSelectedModel || undefined}
                resolveChatId={resolveRuntimeChatId}
                onReady={setRuntimeHandle}
                onStateChange={handleRuntimeStateChange}
                onFinish={handleRuntimeFinish}
              >
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
                {isLoadingSelectedConversation ? (
                  <ChatPaneSkeleton />
                ) : currentMessages.length === 0 && !hasRuntimeMessagesForSelectedConversation && !isStreaming ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center px-4">
                    <div className="max-w-md text-center">
                      <h3 className="mb-2 text-lg font-semibold">Chat with your documents</h3>
                      <p className="text-sm text-muted-foreground">
                        Ask a question and Arkivra will answer from the selected vault context.
                      </p>
                    </div>
                  </div>
                ) : (
                  <AssistantChatThread onQuickReplySelect={(reply) => void handleSendMessage(reply)} />
                )}
                <MessageInput
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
                  textareaRef={textareaRef}
                  onDraftValueChange={setComposerValue}
                />
              </AssistantChatRuntimeProvider>
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
        context={hydratedDraftContext}
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
      <ConversationForkDialog
        open={isForkDialogOpen}
        isPending={isForkingContext}
        currentContext={hydratedDraftContext}
        nextContext={pendingForkContext ?? hydratedDraftContext}
        onOpenChange={handleForkDialogOpenChange}
        onConfirm={() => {
          void handleConfirmFork()
        }}
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

function ChatPaneSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-4 py-6" aria-label="Loading chat">
      <div className="flex justify-start">
        <div className="max-w-[78%] space-y-3 rounded-lg border bg-muted/30 p-4">
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-4 w-52 max-w-full" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[68%] space-y-3 rounded-lg bg-primary/5 p-4">
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-4 w-44 max-w-full" />
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[78%] space-y-3 rounded-lg border bg-muted/30 p-4">
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
      </div>
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

function draftContextsEqual(left: DraftChatContext, right: DraftChatContext) {
  return JSON.stringify(normalizeDraftContext(left)) === JSON.stringify(normalizeDraftContext(right))
}

function cnSidebar(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}
