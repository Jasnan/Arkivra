import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  ScrollArea,
} from '@chakra-ui/react';
import { toast } from '@/components/ui/toaster-store';
import { useWorkspaceSecondary } from '@/components/layout/workspace-context';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { useVaultQuery, useVaultsQuery } from '@/features/vaults/vaults.queries';
import type { ChatResponseMode } from '../chat.api';
import {
  chatQueryKeys,
  useChatConversationQuery,
  useChatConversationsQuery,
  useCreateChatConversationMutation,
  useDeleteChatConversationMutation,
  useUpdateChatConversationContextMutation,
  useChatModelOptionsQuery,
} from '../chat.queries';
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatIntent,
  ChatMessage,
} from '../chat.types';
import type { DraftChatContext, DraftChatDocument, DraftChatVault } from './chat-context-selector';
import type { ChatWorkspaceProps } from './chat-utils';
import {
  NEW_CHAT_DRAFT_ID,
  conversationDayLabel,
  getChatExperienceConfig,
  getLatestIntent,
} from './chat-utils';
import {
  canUseContextSnapshot,
  conversationScopeValuesFromSnapshot,
  getContextAccessMessage,
  getContextUnavailableMessage,
  getRuntimeConversationId,
  hasPendingAssistantMessage,
  messageSignature,
  scopeFromContextSnapshot,
  shouldUseLocalRuntimeMessages,
} from './chat-workspace.helpers';
import { ChatConversationRail } from './chat-conversation-rail';
import {
  contextSnapshotFromDraft,
  createEmptyDraftContext,
  draftContextFromSnapshot,
  getDraftContextFromScope,
  hydrateDraftContextLabels,
  removeDocumentFromDraftContext,
  removeVaultFromDraftContext,
} from './chat-context-selector';
import { ChatEmptyState } from './chat-empty-state';
import type {
  AssistantChatRuntimeHandle,
  AssistantChatRuntimeState,
} from './assistant-chat-runtime';
import { AssistantChatRuntimeProvider } from './assistant-chat-runtime';
import { AssistantChatThread } from './assistant-chat-thread';
import { AssistantChatComposer } from './assistant-chat-composer';
import {
  ChatConversationSkeleton,
  ChatMobileConversationDrawer,
  ChatWorkspaceBanners,
  ChatWorkspaceContextDialogs,
} from './chat-workspace-layout';

export function ChatWorkspace({
  scope,
  documentName,
  inputPlaceholder,
  selectedConversationId,
  heightClassName = 'h-[calc(100vh-14rem)] min-h-[32rem]',
  renderConversationRailInSecondary = false,
  onConversationCreated,
  onConversationSelected,
}: ChatWorkspaceProps) {
  const isFullHeight = heightClassName === 'h-full';
  const { vaultId, documentId } = scope;
  const queryClient = useQueryClient();
  const { defaultChatAnswerMode } = useAccentColor();
  const conversationsQuery = useChatConversationsQuery();
  const modelOptionsQuery = useChatModelOptionsQuery();
  const createConversation = useCreateChatConversationMutation();
  const updateConversationContext = useUpdateChatConversationContextMutation();
  const deleteConversation = useDeleteChatConversationMutation();
  const vaultsQuery = useVaultsQuery();
  const initialDraftContext = useMemo(
    () => getDraftContextFromScope({ vaultId, documentId, documentName }),
    [documentId, documentName, vaultId],
  );
  const [selectedChatId, setSelectedChatId] = useState(selectedConversationId ?? '');
  const [draftContext, setDraftContext] = useState<DraftChatContext>(initialDraftContext);
  const [runtimeState, setRuntimeState] = useState<AssistantChatRuntimeState>({
    messages: [],
    status: 'ready',
  });
  const [runtimeHandle, setRuntimeHandle] = useState<AssistantChatRuntimeHandle | null>(null);
  const [responseMode, setResponseMode] = useState<ChatResponseMode>(defaultChatAnswerMode);
  const [selectedModel, setSelectedModel] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [localRuntimeMessagesByChatId, setLocalRuntimeMessagesByChatId] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [isMobileConversationRailOpen, setIsMobileConversationRailOpen] = useState(false);
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [pendingForkContext, setPendingForkContext] = useState<DraftChatContext | null>(null);
  const [isForkDialogOpen, setIsForkDialogOpen] = useState(false);
  const [isContextWarningDismissed, setIsContextWarningDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasManualResponseModeRef = useRef(false);
  const previousSelectedConversationIdRef = useRef(selectedConversationId);
  const activeRuntimeChatIdRef = useRef('');
  const isStreaming =
    runtimeState.status === 'submitted' ||
    runtimeState.status === 'streaming' ||
    hasPendingAssistantMessage(runtimeState.messages);
  const isDraftConversation = selectedChatId === NEW_CHAT_DRAFT_ID;
  const effectiveSelectedChatId = isDraftConversation ? '' : selectedChatId;
  const selectedLocalRuntimeMessages = effectiveSelectedChatId
    ? localRuntimeMessagesByChatId[effectiveSelectedChatId]
    : undefined;
  const selectedHasPendingLocalMessages = hasPendingAssistantMessage(
    selectedLocalRuntimeMessages ?? [],
  );
  const selectedChatQuery = useChatConversationQuery({
    chatId: effectiveSelectedChatId,
    refetchInterval: (query) => {
      const conversation = query.state.data?.conversation;
      return selectedHasPendingLocalMessages ||
        hasPendingAssistantMessage(conversation?.messages ?? [])
        ? 1500
        : false;
    },
  });
  const hydratedDraftContext = useMemo(
    () =>
      hydrateDraftContextLabels({ context: draftContext, vaults: vaultsQuery.data?.vaults ?? [] }),
    [draftContext, vaultsQuery.data?.vaults],
  );
  const draftContextSnapshot = useMemo(
    () => contextSnapshotFromDraft(hydratedDraftContext),
    [hydratedDraftContext],
  );
  const lockedContextSnapshot = selectedChatQuery.data?.conversation.contextSnapshot ?? null;
  const selectedConversationMessageCount = selectedChatQuery.data?.conversation.messages.length;
  const isPristineSavedConversation =
    effectiveSelectedChatId.length > 0 && selectedConversationMessageCount === 0 && !isStreaming;
  const isContextLocked = effectiveSelectedChatId.length > 0 && !isPristineSavedConversation;
  const contextAvailability = selectedChatQuery.data?.conversation.contextAvailability;
  const isContextReadOnly = contextAvailability?.readOnly === true;
  const activeContextSnapshot =
    isContextLocked && lockedContextSnapshot ? lockedContextSnapshot : draftContextSnapshot;
  const activeScope = scopeFromContextSnapshot(activeContextSnapshot);
  const displayedContext = useMemo(
    () =>
      isContextLocked && lockedContextSnapshot
        ? hydrateDraftContextLabels({
            context: draftContextFromSnapshot(lockedContextSnapshot),
            vaults: vaultsQuery.data?.vaults ?? [],
          })
        : hydratedDraftContext,
    [hydratedDraftContext, isContextLocked, lockedContextSnapshot, vaultsQuery.data?.vaults],
  );
  const activeVaultId = activeScope.vaultId;
  const isActiveGlobalChat = !activeVaultId;
  const experience = getChatExperienceConfig({ scope: activeScope, documentName });
  const vaultQuery = useVaultQuery({ vaultId: activeVaultId ?? '' });
  const vaultAiAccessLevel = activeVaultId ? vaultQuery.data?.vault.aiAccessLevel : undefined;
  const aiAccessByVaultId = useMemo(() => {
    const accessByVaultId = new Map<string, 'none' | 'full'>();
    for (const vault of vaultsQuery.data?.vaults ?? []) {
      accessByVaultId.set(vault.id, vault.aiAccessLevel);
    }

    if (activeVaultId && vaultAiAccessLevel) {
      accessByVaultId.set(activeVaultId, vaultAiAccessLevel);
    }

    return accessByVaultId;
  }, [activeVaultId, vaultAiAccessLevel, vaultsQuery.data?.vaults]);
  const hasFullAiVault = (vaultsQuery.data?.vaults ?? []).some(
    (vault) => vault.aiAccessLevel === 'full',
  );
  const isContextAccessLoading =
    vaultsQuery.isLoading || (activeVaultId ? vaultQuery.isLoading : false);
  const canUseChat =
    !isContextReadOnly &&
    (isContextAccessLoading ||
      canUseContextSnapshot({
        snapshot: activeContextSnapshot,
        aiAccessByVaultId,
        hasFullAiVault,
      }));
  const aiAccessMessage = getContextAccessMessage(activeContextSnapshot);
  const contextUnavailableMessage = getContextUnavailableMessage(
    contextAvailability?.readOnly === true ? contextAvailability.message : undefined,
  );
  const showContextReadOnlyBanner = isContextReadOnly && !isContextWarningDismissed;

  const availableModels = modelOptionsQuery.data?.options.models ?? [];
  const defaultModel = modelOptionsQuery.data?.options.defaultModel ?? '';
  const resolvedSelectedModel =
    selectedModel && (availableModels.length === 0 || availableModels.includes(selectedModel))
      ? selectedModel
      : defaultModel || availableModels[0] || '';

  const persistedMessages = useMemo<ChatMessage[]>(
    () => selectedChatQuery.data?.conversation.messages ?? [],
    [selectedChatQuery.data?.conversation.messages],
  );
  const runtimeMessagesForSelectedChat = useMemo(
    () =>
      shouldUseLocalRuntimeMessages({
        localMessages: selectedLocalRuntimeMessages,
        persistedMessages,
      })
        ? (selectedLocalRuntimeMessages ?? [])
        : persistedMessages,
    [persistedMessages, selectedLocalRuntimeMessages],
  );
  const messages = runtimeState.messages;
  const activeConversationIntent = useMemo(() => getLatestIntent(messages), [messages]);
  const effectiveIntent = activeConversationIntent;
  const isSelectedConversationLoading =
    effectiveSelectedChatId.length > 0 && selectedChatQuery.isLoading && messages.length === 0;
  const shouldShowEmptyState =
    effectiveSelectedChatId.length === 0 &&
    messages.length === 0 &&
    !isStreaming &&
    !createConversation.isPending;
  const isComposerDisabled =
    isSelectedConversationLoading || !canUseChat || isStreaming || createConversation.isPending;
  const visibleConversations = useMemo<ChatConversation[]>(() => {
    const conversations = conversationsQuery.data?.conversations ?? [];
    if (!isDraftConversation) return conversations;
    const draftScopeValues = conversationScopeValuesFromSnapshot(draftContextSnapshot);
    return [
      {
        id: NEW_CHAT_DRAFT_ID,
        title: 'New chat',
        scope: draftScopeValues.scope,
        vaultId: draftScopeValues.vaultId,
        documentId: draftScopeValues.documentId,
        contextSnapshot: draftContextSnapshot,
        userId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...conversations,
    ];
  }, [conversationsQuery.data?.conversations, isDraftConversation, draftContextSnapshot]);
  const conversationSections = useMemo(() => {
    const sections = new Map<string, ChatConversation[]>();
    for (const conversation of visibleConversations) {
      const label = conversationDayLabel(conversation.updatedAt);
      const current = sections.get(label) ?? [];
      current.push(conversation);
      sections.set(label, current);
    }
    return [...sections.entries()];
  }, [visibleConversations]);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }, []);

  const resetComposerState = useCallback(() => {
    setComposerValue('');
    setRuntimeState({ messages: [], status: 'ready' });
  }, []);

  const setLocalRuntimeMessages = useCallback(
    (chatId: string, messages: ChatMessage[]) => {
      if (chatId.length === 0 || messages.length === 0) return;

      setLocalRuntimeMessagesByChatId((current) => {
        const existing = current[chatId];
        if (existing && messageSignature(existing) === messageSignature(messages)) return current;
        return { ...current, [chatId]: messages };
      });

      queryClient.setQueryData(
        chatQueryKeys.conversation(chatId),
        (current: { conversation: ChatConversationDetail } | undefined) => {
          const currentConversation = current?.conversation;
          if (!currentConversation) return current;
          if (messageSignature(currentConversation.messages) === messageSignature(messages))
            return current;

          return {
            conversation: {
              ...currentConversation,
              messages,
            },
          };
        },
      );
    },
    [queryClient],
  );

  const handleRuntimeStateChange = useCallback(
    (state: AssistantChatRuntimeState) => {
      const runtimeConversationId = getRuntimeConversationId(state.messages);
      const targetChatId =
        runtimeConversationId ??
        (state.status === 'submitted' || state.status === 'streaming'
          ? activeRuntimeChatIdRef.current
          : effectiveSelectedChatId);

      if (targetChatId && state.messages.length > 0) {
        setLocalRuntimeMessages(targetChatId, state.messages);
      }

      if (!targetChatId || targetChatId === effectiveSelectedChatId) {
        setRuntimeState(state);
      }
    },
    [effectiveSelectedChatId, setLocalRuntimeMessages],
  );

  useEffect(() => {
    if (selectedConversationId === previousSelectedConversationIdRef.current) return;
    previousSelectedConversationIdRef.current = selectedConversationId;
    if (selectedConversationId && selectedConversationId === selectedChatId) return;
    setSelectedChatId(selectedConversationId ?? '');
    resetComposerState();
  }, [resetComposerState, selectedChatId, selectedConversationId]);

  useEffect(() => {
    if (hasManualResponseModeRef.current) return;
    setResponseMode(defaultChatAnswerMode);
  }, [defaultChatAnswerMode]);

  const handleResponseModeChange = useCallback((nextResponseMode: ChatResponseMode) => {
    hasManualResponseModeRef.current = true;
    setResponseMode(nextResponseMode);
  }, []);

  useEffect(() => {
    setIsContextWarningDismissed(false);
  }, [contextAvailability?.status, effectiveSelectedChatId]);

  useEffect(() => {
    if (selectedConversationId === undefined && selectedChatId.length === 0) {
      setDraftContext(initialDraftContext);
    }
  }, [initialDraftContext, selectedChatId, selectedConversationId]);

  useEffect(() => {
    const conversation = selectedChatQuery.data?.conversation;
    if (!isPristineSavedConversation || conversation === undefined) return;
    setDraftContext(draftContextFromSnapshot(conversation.contextSnapshot));
  }, [isPristineSavedConversation, selectedChatQuery.data?.conversation]);

  useEffect(() => {
    if (!effectiveSelectedChatId || selectedLocalRuntimeMessages === undefined) return;
    if (hasPendingAssistantMessage(persistedMessages)) return;
    if (persistedMessages.length < selectedLocalRuntimeMessages.length) return;

    setLocalRuntimeMessagesByChatId((current) => {
      if (!(effectiveSelectedChatId in current)) return current;
      const next = { ...current };
      delete next[effectiveSelectedChatId];
      return next;
    });
  }, [effectiveSelectedChatId, persistedMessages, selectedLocalRuntimeMessages]);

  const handleCreateConversation = useCallback(() => {
    setSelectedChatId(NEW_CHAT_DRAFT_ID);
    setDraftContext(
      selectedConversationId === undefined ? initialDraftContext : createEmptyDraftContext(),
    );
    setIsMobileConversationRailOpen(false);
    resetComposerState();
    focusComposer();
  }, [focusComposer, initialDraftContext, resetComposerState, selectedConversationId]);

  const handleSelectConversation = useCallback(
    (chatId: string) => {
      if (chatId === effectiveSelectedChatId) return;
      setSelectedChatId(chatId);
      resetComposerState();
      onConversationSelected?.(chatId);
    },
    [effectiveSelectedChatId, onConversationSelected, resetComposerState],
  );

  const handleSelectMobileConversation = useCallback(
    (chatId: string) => {
      handleSelectConversation(chatId);
      setIsMobileConversationRailOpen(false);
    },
    [handleSelectConversation],
  );

  const handleDeleteConversation = useCallback(
    async (chatId: string) => {
      if (chatId === NEW_CHAT_DRAFT_ID) {
        setSelectedChatId('');
        setDraftContext(initialDraftContext);
        resetComposerState();
        return;
      }

      await deleteConversation.mutateAsync({ chatId });
      if (selectedChatId === chatId) setSelectedChatId('');
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() });
    },
    [deleteConversation, initialDraftContext, queryClient, resetComposerState, selectedChatId],
  );

  const handleDeleteConversationClick = useCallback(
    (chatId: string) => {
      void handleDeleteConversation(chatId);
    },
    [handleDeleteConversation],
  );

  function applyContextChange(nextContext: DraftChatContext) {
    const hydratedNextContext = hydrateDraftContextLabels({
      context: nextContext,
      vaults: vaultsQuery.data?.vaults ?? [],
    });

    if (isContextLocked) {
      setPendingForkContext(hydratedNextContext);
      setIsForkDialogOpen(true);
      return;
    }

    setDraftContext(hydratedNextContext);
    if (effectiveSelectedChatId.length > 0) {
      const contextSnapshot = contextSnapshotFromDraft(hydratedNextContext);
      void updateConversationContext
        .mutateAsync({ chatId: effectiveSelectedChatId, contextSnapshot })
        .then((result) => {
          queryClient.setQueryData(
            chatQueryKeys.conversation(effectiveSelectedChatId),
            (current: { conversation: ChatConversationDetail } | undefined) => {
              const currentConversation = current?.conversation;
              return {
                conversation: {
                  ...(currentConversation ?? {}),
                  ...result.conversation,
                  messages: currentConversation?.messages ?? [],
                },
              };
            },
          );
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() });
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : 'Could not update conversation context.';
          toast.error(message);
          void queryClient.invalidateQueries({
            queryKey: chatQueryKeys.conversation(effectiveSelectedChatId),
          });
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() });
        });
    }
  }

  function handleVaultSelectionConfirm(vaults: DraftChatVault[]) {
    applyContextChange({
      vaults,
      documents: displayedContext.documents,
    });
  }

  function handleDocumentSelectionConfirm(documents: DraftChatDocument[]) {
    applyContextChange({
      vaults: displayedContext.vaults,
      documents,
    });
  }

  function handleRemoveVault(vault: DraftChatVault) {
    applyContextChange(removeVaultFromDraftContext(displayedContext, vault.vaultId));
  }

  function handleRemoveDocument(document: DraftChatDocument) {
    applyContextChange(removeDocumentFromDraftContext(displayedContext, document));
  }

  function handleForkDialogOpenChange(open: boolean) {
    setIsForkDialogOpen(open);
    if (!open) {
      setPendingForkContext(null);
    }
  }

  async function handleConfirmFork() {
    if (pendingForkContext === null) {
      setIsForkDialogOpen(false);
      return;
    }

    try {
      const contextSnapshot = contextSnapshotFromDraft(pendingForkContext);
      const title = composerValue.trim() || selectedChatQuery.data?.conversation.title;
      const result = await createConversation.mutateAsync({ contextSnapshot, title });
      const chatId = result.conversation.id;

      setDraftContext(pendingForkContext);
      setSelectedChatId(chatId);
      setIsForkDialogOpen(false);
      setPendingForkContext(null);
      onConversationCreated?.(chatId);
      queryClient.setQueryData(chatQueryKeys.conversation(chatId), {
        conversation: { ...result.conversation, messages: [] },
      });
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() });
      focusComposer();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create a new chat.';
      toast.error(message);
    }
  }

  async function handleSend(content: string, intentOverride?: ChatIntent | null) {
    const resolvedIntent = isActiveGlobalChat ? (intentOverride ?? effectiveIntent) : null;
    if (runtimeHandle === null) return;
    activeRuntimeChatIdRef.current = effectiveSelectedChatId;

    try {
      await runtimeHandle.sendText(content, { intent: resolvedIntent });
      setComposerValue('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send message.';
      toast.error(message);
    }
  }

  const resolveRuntimeChatId = useCallback(
    async ({ content }: { content: string }) => {
      if (effectiveSelectedChatId.length > 0) {
        activeRuntimeChatIdRef.current = effectiveSelectedChatId;
        return effectiveSelectedChatId;
      }

      const result = await createConversation.mutateAsync({
        contextSnapshot: contextSnapshotFromDraft(hydratedDraftContext),
        title: content,
      });
      const chatId = result.conversation.id;
      activeRuntimeChatIdRef.current = chatId;
      setSelectedChatId(chatId);
      onConversationCreated?.(chatId);
      queryClient.setQueryData(chatQueryKeys.conversation(chatId), {
        conversation: { ...result.conversation, messages: [] },
      });
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() });
      return chatId;
    },
    [
      createConversation,
      effectiveSelectedChatId,
      hydratedDraftContext,
      onConversationCreated,
      queryClient,
    ],
  );

  const handleRuntimeFinish = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() }),
      effectiveSelectedChatId
        ? queryClient.invalidateQueries({
            queryKey: chatQueryKeys.conversation(effectiveSelectedChatId),
          })
        : Promise.resolve(),
    ]);
  }, [effectiveSelectedChatId, queryClient]);

  const conversationRailProps = useMemo(
    () => ({
      conversationsQuery,
      conversationSections,
      selectedChatId,
      effectiveSelectedChatId,
      createConversationPending: createConversation.isPending,
      onCreateConversation: handleCreateConversation,
      onSelectConversation: handleSelectConversation,
      onDeleteConversation: handleDeleteConversationClick,
    }),
    [
      conversationSections,
      conversationsQuery,
      createConversation.isPending,
      effectiveSelectedChatId,
      handleCreateConversation,
      handleDeleteConversationClick,
      handleSelectConversation,
      selectedChatId,
    ],
  );

  const mobileConversationRailProps = useMemo(
    () => ({
      ...conversationRailProps,
      showHeader: false,
      onSelectConversation: handleSelectMobileConversation,
    }),
    [conversationRailProps, handleSelectMobileConversation],
  );

  const secondaryConversationRail = useMemo(() => {
    if (!renderConversationRailInSecondary) return null;

    return <ChatConversationRail {...conversationRailProps} />;
  }, [conversationRailProps, renderConversationRailInSecondary]);

  useWorkspaceSecondary(secondaryConversationRail);

  return (
    <Box
      display="grid"
      position="relative"
      w="full"
      maxW="full"
      h={isFullHeight ? 'full' : 'calc(100vh - 14rem)'}
      minH={isFullHeight ? '0' : '32rem'}
      minW="0"
      overflow="hidden"
      gap="0"
      bg="bg.workspace"
      p="0"
      gridTemplateColumns={{
        base: '1fr',
        lg: renderConversationRailInSecondary ? 'minmax(0, 1fr)' : '20.5rem minmax(0, 1fr)',
      }}
    >
      {!renderConversationRailInSecondary ? (
        <Box
          as="aside"
          position="relative"
          display={{ base: 'none', lg: 'flex' }}
          flexDirection="column"
          minH="0"
          overflow="hidden"
          borderRightWidth="1px"
          borderColor="border.surface"
          bg="bg.sidebar"
          px="6"
          pb="3"
        >
          <ChatConversationRail {...conversationRailProps} />
        </Box>
      ) : null}

      <Box
        as="section"
        display="grid"
        gridTemplateRows="auto 1fr auto"
        h="100%"
        minH="0"
        minW="0"
        maxH="100%"
        maxW="full"
        overflow="hidden"
        rounded="0"
        borderWidth="0"
        borderColor="border.surface"
        bg="bg.workspace"
        shadow="none"
      >
        <Box minH="0">
          <ChatWorkspaceBanners
            aiAccessMessage={aiAccessMessage}
            canUseChat={canUseChat}
            contextUnavailableMessage={contextUnavailableMessage}
            isContextReadOnly={isContextReadOnly}
            runtimeState={runtimeState}
            showContextReadOnlyBanner={showContextReadOnlyBanner}
            onDismissContextWarning={() => setIsContextWarningDismissed(true)}
          />
          <ChatMobileConversationDrawer
            open={isMobileConversationRailOpen}
            railProps={mobileConversationRailProps}
            onOpenChange={setIsMobileConversationRailOpen}
          />
        </Box>

        <AssistantChatRuntimeProvider
          chatId={effectiveSelectedChatId}
          messages={runtimeMessagesForSelectedChat}
          disabled={isComposerDisabled}
          intent={isActiveGlobalChat ? effectiveIntent : null}
          responseMode={responseMode}
          model={resolvedSelectedModel || undefined}
          resolveChatId={resolveRuntimeChatId}
          onReady={setRuntimeHandle}
          onStateChange={handleRuntimeStateChange}
          onFinish={handleRuntimeFinish}
        >
          {isSelectedConversationLoading ? (
            <ScrollArea.Root h="full" minH="0" minW="0" size="xs" variant="hover">
              <ScrollArea.Viewport h="full">
                <ScrollArea.Content minH="full">
                  <ChatConversationSkeleton />
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar bg="transparent">
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          ) : shouldShowEmptyState ? (
            <ScrollArea.Root h="full" minH="0" minW="0" size="xs" variant="hover">
              <ScrollArea.Viewport h="full">
                <ScrollArea.Content minH="full">
                  <ChatEmptyState
                    title={experience.emptyTitle}
                    description={experience.emptyDescription}
                    promptSuggestions={experience.promptSuggestions}
                    disabled={!canUseChat}
                    onPromptSelect={(prompt) => {
                      void handleSend(prompt);
                    }}
                  />
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar bg="transparent">
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          ) : (
            <AssistantChatThread
              currentVaultId={activeVaultId}
              scope={activeScope}
              onQuickReplySelect={
                isActiveGlobalChat
                  ? (reply) => {
                      void handleSend(reply, effectiveIntent);
                    }
                  : undefined
              }
            />
          )}

          <AssistantChatComposer
            disabled={isComposerDisabled}
            placeholder={inputPlaceholder}
            responseMode={responseMode}
            modelOptions={modelOptionsQuery.data?.options.models}
            selectedModel={resolvedSelectedModel}
            isLoadingModels={modelOptionsQuery.isLoading}
            modelOptionsError={
              modelOptionsQuery.isError
                ? 'Could not load available Ollama models for this chat.'
                : null
            }
            onSelectedModelChange={setSelectedModel}
            onResponseModeChange={handleResponseModeChange}
            context={displayedContext}
            contextLocked={isContextLocked}
            onAddVaults={() => setIsVaultDialogOpen(true)}
            onAddDocuments={() => setIsDocumentDialogOpen(true)}
            onRemoveVault={handleRemoveVault}
            onRemoveDocument={handleRemoveDocument}
            textareaRef={textareaRef}
            onDraftValueChange={setComposerValue}
          />
        </AssistantChatRuntimeProvider>
      </Box>

      <ChatWorkspaceContextDialogs
        context={displayedContext}
        createConversationPending={createConversation.isPending}
        documentDialogOpen={isDocumentDialogOpen}
        forkDialogOpen={isForkDialogOpen}
        nextContext={pendingForkContext ?? displayedContext}
        vaultDialogOpen={isVaultDialogOpen}
        vaults={vaultsQuery.data?.vaults ?? []}
        onConfirmDocuments={handleDocumentSelectionConfirm}
        onConfirmFork={() => {
          void handleConfirmFork();
        }}
        onConfirmVaults={handleVaultSelectionConfirm}
        onDocumentDialogOpenChange={setIsDocumentDialogOpen}
        onForkDialogOpenChange={handleForkDialogOpenChange}
        onVaultDialogOpenChange={setIsVaultDialogOpen}
      />
    </Box>
  );
}
