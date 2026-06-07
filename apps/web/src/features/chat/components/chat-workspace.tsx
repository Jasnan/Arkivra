import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  CloseButton,
  Drawer,
  Flex,
  Portal,
  ScrollArea,
  Skeleton,
  Status,
  Text,
} from '@chakra-ui/react';
import {
  AlertCircle,
  MessageSquare,
  X,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster-store';
import { Button } from '@/components/ui/button';
import { useWorkspaceSecondary } from '@/components/layout/workspace-context';
import { useVaultQuery, useVaultsQuery } from '@/features/vaults/vaults.queries';
import type { ChatApiScope, ChatResponseMode } from '../chat.api';
import {
  chatQueryKeys,
  useChatConversationQuery,
  useChatConversationsQuery,
  useCreateChatConversationMutation,
  useDeleteChatConversationMutation,
  useUpdateChatConversationContextMutation,
  useChatModelOptionsQuery,
} from '../chat.queries';
import type { ChatContextSnapshot, ChatConversation, ChatConversationDetail, ChatIntent, ChatMessage } from '../chat.types';
import type { DraftChatContext, DraftChatDocument, DraftChatVault } from './chat-context-selector';
import type {
  ChatWorkspaceProps,
} from './chat-utils';
import {
  NEW_CHAT_DRAFT_ID,
  conversationDayLabel,
  getChatExperienceConfig,
  getLatestIntent,
} from './chat-utils';
import { ChatConversationRail } from './chat-conversation-rail';
import {
  ConversationForkDialog,
  DocumentSelectionDialog,
  VaultSelectionDialog,
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
import {
  AssistantChatRuntimeProvider,
} from './assistant-chat-runtime';
import { AssistantChatThread } from './assistant-chat-thread';
import { AssistantChatComposer } from './assistant-chat-composer';

function scopeFromContextSnapshot(snapshot: ChatContextSnapshot): ChatApiScope {
  if (snapshot.type === 'document') {
    return { vaultId: snapshot.vaultId, documentId: snapshot.documentId };
  }

  if (snapshot.type === 'vault') {
    return { vaultId: snapshot.vaultId };
  }

  return {};
}

function conversationScopeValuesFromSnapshot(snapshot: ChatContextSnapshot) {
  if (snapshot.type === 'document') {
    return {
      scope: 'document' as const,
      vaultId: snapshot.vaultId,
      documentId: snapshot.documentId,
    };
  }

  if (snapshot.type === 'vault') {
    return {
      scope: 'vault' as const,
      vaultId: snapshot.vaultId,
      documentId: null,
    };
  }

  return {
    scope: 'global' as const,
    vaultId: null,
    documentId: null,
  };
}

function getContextAccessMessage(snapshot: ChatContextSnapshot) {
  if (snapshot.type === 'document') {
    return 'Document chat requires document chat or full AI access on this vault.';
  }

  if (snapshot.type === 'vault') {
    return 'To chat with this vault, join it as a member with full AI access. Admin access alone is not enough.';
  }

  if (snapshot.type === 'selection') {
    return 'Selected context includes vaults or documents without the required AI access.';
  }

  return 'To start using chat, join at least one vault as a member with full AI access. Admin access alone is not enough.';
}

function getContextUnavailableMessage(message?: string) {
  return message ?? 'One or more source documents were deleted. This conversation is available as read-only history.';
}

function getMessageConversationId(message: ChatMessage) {
  const conversationId = message.metadata?.conversationId;
  return typeof conversationId === 'string' && conversationId.length > 0 ? conversationId : null;
}

function getRuntimeConversationId(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const conversationId = getMessageConversationId(messages[index]);
    if (conversationId !== null) return conversationId;
  }

  return null;
}

function hasPendingAssistantMessage(messages: ChatMessage[]) {
  return messages.some((message) => {
    if (message.role !== 'assistant') return false;
    const generationStatus = message.metadata?.generationStatus;
    if (generationStatus === 'completed' || generationStatus === 'failed') return false;
    return message.parts.some(part => part.type === 'data-status') || generationStatus === undefined || generationStatus === null;
  });
}

function messageSignature(messages: ChatMessage[]) {
  return messages
    .map((message) => [
      message.id,
      message.role,
      message.metadata?.generationStatus ?? '',
      message.parts.map((part) => {
        if (part.type === 'text') return `text:${part.text}`;
        if (part.type === 'data-status') {
          const label = typeof part.data === 'object'
            && part.data !== null
            && 'label' in part.data
            && typeof part.data.label === 'string'
            ? part.data.label
            : '';
          return `status:${label}`;
        }
        return part.type;
      }).join(','),
    ].join('|'))
    .join('||');
}

function shouldUseLocalRuntimeMessages({
  localMessages,
  persistedMessages,
}: {
  localMessages: ChatMessage[] | undefined;
  persistedMessages: ChatMessage[];
}) {
  if (!localMessages || localMessages.length === 0) return false;
  if (persistedMessages.length === 0) return true;
  if (hasPendingAssistantMessage(localMessages) && persistedMessages.length < localMessages.length) return true;
  return false;
}

function canUseContextSnapshot({
  snapshot,
  aiAccessByVaultId,
  hasFullAiVault,
}: {
  snapshot: ChatContextSnapshot;
  aiAccessByVaultId: Map<string, 'none' | 'full'>;
  hasFullAiVault: boolean;
}) {
  if (snapshot.type === 'global') {
    if (snapshot.vaultIds.length === 0) return hasFullAiVault;
    return snapshot.vaultIds.every(vaultId => aiAccessByVaultId.get(vaultId) === 'full');
  }

  if (snapshot.type === 'vault') {
    return aiAccessByVaultId.get(snapshot.vaultId) === 'full';
  }

  if (snapshot.type === 'document') {
    return aiAccessByVaultId.get(snapshot.vaultId) === 'full';
  }

  if (snapshot.vaults.length === 0 && snapshot.documents.length === 0) {
    return false;
  }

  return (
    snapshot.vaults.every(vault => aiAccessByVaultId.get(vault.vaultId) === 'full')
    && snapshot.documents.every(document => aiAccessByVaultId.get(document.vaultId) === 'full')
  );
}

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
  const [responseMode, setResponseMode] = useState<ChatResponseMode>('text');
  const [selectedModel, setSelectedModel] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [localRuntimeMessagesByChatId, setLocalRuntimeMessagesByChatId] = useState<Record<string, ChatMessage[]>>({});
  const [isMobileConversationRailOpen, setIsMobileConversationRailOpen] = useState(false);
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [pendingForkContext, setPendingForkContext] = useState<DraftChatContext | null>(null);
  const [isForkDialogOpen, setIsForkDialogOpen] = useState(false);
  const [isContextWarningDismissed, setIsContextWarningDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousSelectedConversationIdRef = useRef(selectedConversationId);
  const activeRuntimeChatIdRef = useRef('');
  const isStreaming = runtimeState.status === 'submitted' || runtimeState.status === 'streaming';
  const isDraftConversation = selectedChatId === NEW_CHAT_DRAFT_ID;
  const effectiveSelectedChatId = isDraftConversation
    ? ''
    : selectedChatId;
  const selectedLocalRuntimeMessages = effectiveSelectedChatId
    ? localRuntimeMessagesByChatId[effectiveSelectedChatId]
    : undefined;
  const selectedHasPendingLocalMessages = hasPendingAssistantMessage(selectedLocalRuntimeMessages ?? []);
  const selectedChatQuery = useChatConversationQuery({
    chatId: effectiveSelectedChatId,
    refetchInterval: selectedHasPendingLocalMessages ? 1500 : false,
  });
  const hydratedDraftContext = useMemo(
    () => hydrateDraftContextLabels({ context: draftContext, vaults: vaultsQuery.data?.vaults ?? [] }),
    [draftContext, vaultsQuery.data?.vaults],
  );
  const draftContextSnapshot = useMemo(
    () => contextSnapshotFromDraft(hydratedDraftContext),
    [hydratedDraftContext],
  );
  const lockedContextSnapshot = selectedChatQuery.data?.conversation.contextSnapshot ?? null;
  const selectedConversationMessageCount = selectedChatQuery.data?.conversation.messages.length;
  const isPristineSavedConversation = effectiveSelectedChatId.length > 0
    && selectedConversationMessageCount === 0
    && !isStreaming;
  const isContextLocked = effectiveSelectedChatId.length > 0 && !isPristineSavedConversation;
  const contextAvailability = selectedChatQuery.data?.conversation.contextAvailability;
  const isContextReadOnly = contextAvailability?.readOnly === true;
  const activeContextSnapshot = isContextLocked && lockedContextSnapshot
    ? lockedContextSnapshot
    : draftContextSnapshot;
  const activeScope = scopeFromContextSnapshot(activeContextSnapshot);
  const displayedContext = useMemo(
    () => isContextLocked && lockedContextSnapshot
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
  const hasFullAiVault = (vaultsQuery.data?.vaults ?? []).some((vault) => vault.aiAccessLevel === 'full');
  const isContextAccessLoading = vaultsQuery.isLoading || (activeVaultId ? vaultQuery.isLoading : false);
  const canUseChat = !isContextReadOnly
    && (isContextAccessLoading || canUseContextSnapshot({
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
    () => shouldUseLocalRuntimeMessages({
      localMessages: selectedLocalRuntimeMessages,
      persistedMessages,
    })
      ? selectedLocalRuntimeMessages ?? []
      : persistedMessages,
    [persistedMessages, selectedLocalRuntimeMessages],
  );
  const messages = runtimeState.messages;
  const activeConversationIntent = useMemo(() => getLatestIntent(messages), [messages]);
  const effectiveIntent = activeConversationIntent;
  const shouldShowEmptyState = messages.length === 0 && !isStreaming;
  const isComposerDisabled = !canUseChat || isStreaming || createConversation.isPending;
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
  }, [
    conversationsQuery.data?.conversations,
    isDraftConversation,
    draftContextSnapshot,
  ]);
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

  const setLocalRuntimeMessages = useCallback((chatId: string, messages: ChatMessage[]) => {
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
        if (messageSignature(currentConversation.messages) === messageSignature(messages)) return current;

        return {
          conversation: {
            ...currentConversation,
            messages,
          },
        };
      },
    );
  }, [queryClient]);

  const handleRuntimeStateChange = useCallback((state: AssistantChatRuntimeState) => {
    const runtimeConversationId = getRuntimeConversationId(state.messages);
    const targetChatId = runtimeConversationId
      ?? (state.status === 'submitted' || state.status === 'streaming' ? activeRuntimeChatIdRef.current : effectiveSelectedChatId);

    if (targetChatId && state.messages.length > 0) {
      setLocalRuntimeMessages(targetChatId, state.messages);
    }

    if (!targetChatId || targetChatId === effectiveSelectedChatId) {
      setRuntimeState(state);
    }
  }, [effectiveSelectedChatId, setLocalRuntimeMessages]);

  useEffect(() => {
    if (selectedConversationId === previousSelectedConversationIdRef.current) return;
    previousSelectedConversationIdRef.current = selectedConversationId;
    if (selectedConversationId && selectedConversationId === selectedChatId) return;
    setSelectedChatId(selectedConversationId ?? '');
    resetComposerState();
  }, [resetComposerState, selectedChatId, selectedConversationId]);

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
    setDraftContext(selectedConversationId === undefined ? initialDraftContext : createEmptyDraftContext());
    setIsMobileConversationRailOpen(false);
    resetComposerState();
    focusComposer();
  }, [focusComposer, initialDraftContext, resetComposerState, selectedConversationId]);

  const handleSelectConversation = useCallback((chatId: string) => {
    if (chatId === effectiveSelectedChatId) return;
    setSelectedChatId(chatId);
    resetComposerState();
    onConversationSelected?.(chatId);
  }, [effectiveSelectedChatId, onConversationSelected, resetComposerState]);

  const handleSelectMobileConversation = useCallback((chatId: string) => {
    handleSelectConversation(chatId);
    setIsMobileConversationRailOpen(false);
  }, [handleSelectConversation]);

  const handleDeleteConversation = useCallback(async (chatId: string) => {
    if (chatId === NEW_CHAT_DRAFT_ID) {
      setSelectedChatId('');
      setDraftContext(initialDraftContext);
      resetComposerState();
      return;
    }

    await deleteConversation.mutateAsync({ chatId });
    if (selectedChatId === chatId) setSelectedChatId('');
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() });
  }, [deleteConversation, initialDraftContext, queryClient, resetComposerState, selectedChatId]);

  const handleDeleteConversationClick = useCallback((chatId: string) => {
    void handleDeleteConversation(chatId);
  }, [handleDeleteConversation]);

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
      void updateConversationContext.mutateAsync({ chatId: effectiveSelectedChatId, contextSnapshot })
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
          const message = error instanceof Error
            ? error.message
            : 'Could not update conversation context.';
          toast.error(message);
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(effectiveSelectedChatId) });
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

  const resolveRuntimeChatId = useCallback(async ({ content }: { content: string }) => {
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
  }, [
    createConversation,
    effectiveSelectedChatId,
    hydratedDraftContext,
    onConversationCreated,
    queryClient,
  ]);

  const handleRuntimeFinish = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() }),
      effectiveSelectedChatId
        ? queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(effectiveSelectedChatId) })
        : Promise.resolve(),
    ]);
  }, [effectiveSelectedChatId, queryClient]);

  const conversationRailProps = useMemo(() => ({
    conversationsQuery,
    conversationSections,
    selectedChatId,
    effectiveSelectedChatId,
    createConversationPending: createConversation.isPending,
    onCreateConversation: handleCreateConversation,
    onSelectConversation: handleSelectConversation,
    onDeleteConversation: handleDeleteConversationClick,
  }), [
    conversationSections,
    conversationsQuery,
    createConversation.isPending,
    effectiveSelectedChatId,
    handleCreateConversation,
    handleDeleteConversationClick,
    handleSelectConversation,
    selectedChatId,
  ]);

  const mobileConversationRailProps = useMemo(() => ({
    ...conversationRailProps,
    showHeader: false,
    onSelectConversation: handleSelectMobileConversation,
  }), [conversationRailProps, handleSelectMobileConversation]);

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
          {runtimeState.error ? (
            <Flex
              align="center"
              gap="2"
              borderBottomWidth="1px"
              borderColor="border"
              bg="bg.error"
              px="4"
              py="3"
              fontSize="sm"
              color="fg.error"
              sm={{ px: '6' }}
            >
              <AlertCircle size={16} />
              {runtimeState.error.message}
            </Flex>
          ) : null}
          {showContextReadOnlyBanner ? (
            <Box px="4" pt={{ base: '4', md: '5' }} sm={{ px: '6' }}>
              <Flex
                align="flex-start"
                gap="4"
                mx="auto"
                maxW="72rem"
                rounded="xl"
                borderWidth="1px"
                borderColor="orange.muted"
                bg="orange.subtle"
                px={{ base: '4', md: '5' }}
                py="4"
                color="fg"
                shadow="xs"
              >
                <Flex mt="0.5" boxSize="7" align="center" justify="center" rounded="full" color="orange.fg" flexShrink="0">
                  <AlertCircle size={22} />
                </Flex>
                <Box minW="0" flex="1">
                  <Text fontSize="sm" fontWeight="semibold" color="orange.fg">
                    One or more source documents were deleted.
                  </Text>
                  <Text mt="1.5" fontSize="sm" color="fg">
                    {contextUnavailableMessage.replace('One or more source documents were deleted. ', '')}
                  </Text>
                </Box>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Dismiss source document warning"
                  color="fg.muted"
                  flexShrink="0"
                  style={{ height: '2rem', width: '2rem', borderRadius: '0.5rem' }}
                  onClick={() => setIsContextWarningDismissed(true)}
                >
                  <X size={18} />
                </Button>
              </Flex>
            </Box>
          ) : null}
          {!canUseChat && !isContextReadOnly ? (
            <Flex
              align="center"
              gap="2"
              borderBottomWidth="1px"
              borderColor="border"
              bg="bg.warning"
              px="4"
              py="3"
              fontSize="sm"
              color="fg.warning"
              sm={{ px: '6' }}
            >
              <AlertCircle size={16} />
              {aiAccessMessage}
            </Flex>
          ) : null}

          <Box
            display={{ base: 'block', lg: 'none' }}
            w="full"
            maxW="full"
            borderBottomWidth="1px"
            borderColor="border.surface"
            px="4"
            py="3"
            minW="0"
            overflowX="hidden"
            sm={{ px: '6' }}
          >
            <Drawer.Root
              open={isMobileConversationRailOpen}
              placement="bottom"
              size="full"
              onOpenChange={(event) => setIsMobileConversationRailOpen(event.open)}
            >
              <Drawer.Trigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  w="full"
                  justifyContent="space-between"
                  px="0"
                  color="fg"
                  _hover={{ bg: 'transparent', color: 'teal.fg' }}
                >
                  <Flex align="center" gap="2" minW="0" fontSize="sm" fontWeight="semibold">
                    <MessageSquare size={16} color="var(--chakra-colors-teal-fg)" />
                    <Text as="span">Conversations</Text>
                  </Flex>
                  <Text as="span" flexShrink="0" fontSize="sm" fontWeight="medium" color="fg.muted">
                    Show history
                  </Text>
                </Button>
              </Drawer.Trigger>
              <Portal>
                <Drawer.Backdrop bg="blackAlpha.500" />
                <Drawer.Positioner>
                  <Drawer.Content maxH="84vh" roundedTop="xl" bg="bg.sidebar">
                    <Drawer.Header borderBottomWidth="1px" borderColor="border.surface" px="5" py="4">
                      <Flex align="center" justify="space-between" gap="4" pr="8">
                        <Box minW="0">
                          <Drawer.Title fontSize="lg" fontWeight="semibold">
                            Conversations
                          </Drawer.Title>
                          <Drawer.Description srOnly>
                            Chat conversation history
                          </Drawer.Description>
                        </Box>
                      </Flex>
                    </Drawer.Header>
                    <Drawer.Body display="flex" minH="0" flexDirection="column" overflow="hidden" px="5" py="4">
                      <ChatConversationRail {...mobileConversationRailProps} />
                    </Drawer.Body>
                    <Drawer.CloseTrigger asChild>
                      <CloseButton
                        size="sm"
                        position="absolute"
                        top="3"
                        right="3"
                        aria-label="Close conversations"
                      />
                    </Drawer.CloseTrigger>
                  </Drawer.Content>
                </Drawer.Positioner>
              </Portal>
            </Drawer.Root>
          </Box>
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
          {shouldShowEmptyState ? (
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
          ) : selectedChatQuery.isLoading && messages.length === 0 ? (
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
            onResponseModeChange={setResponseMode}
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

      <VaultSelectionDialog
        open={isVaultDialogOpen}
        context={displayedContext}
        vaults={vaultsQuery.data?.vaults ?? []}
        onOpenChange={setIsVaultDialogOpen}
        onConfirm={handleVaultSelectionConfirm}
      />
      <DocumentSelectionDialog
        open={isDocumentDialogOpen}
        context={displayedContext}
        vaults={vaultsQuery.data?.vaults ?? []}
        onOpenChange={setIsDocumentDialogOpen}
        onConfirm={handleDocumentSelectionConfirm}
      />
      <ConversationForkDialog
        open={isForkDialogOpen}
        isPending={createConversation.isPending}
        currentContext={displayedContext}
        nextContext={pendingForkContext ?? displayedContext}
        onOpenChange={handleForkDialogOpenChange}
        onConfirm={() => {
          void handleConfirmFork();
        }}
      />
    </Box>
  );
}

function ChatConversationSkeleton() {
  return (
    <Flex
      direction="column"
      gap="5"
      mx="auto"
      w="100%"
      maxW="72rem"
      px="4"
      py={{ base: '5', md: '6' }}
      sm={{ px: '6' }}
    >
      <Status.Root colorPalette="teal" size="sm" color="fg.muted">
        <Status.Indicator />
        Loading conversation
      </Status.Root>

      <Flex gap="3" align="flex-start">
        <Skeleton boxSize="9" rounded="lg" flexShrink="0" />
        <Box
          w="100%"
          maxW="44rem"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          px="5"
          py="4"
        >
          <Skeleton h="4" maxW="82%" mb="3" />
          <Skeleton h="4" maxW="96%" mb="3" />
          <Skeleton h="4" maxW="64%" />
        </Box>
      </Flex>

      <Flex gap="3" justify="flex-end">
        <Box w="100%" maxW="32rem" rounded="xl" bg="teal.subtle" px="4" py="3">
          <Skeleton h="4" maxW="92%" mb="3" />
          <Skeleton h="4" maxW="54%" />
        </Box>
        <Skeleton boxSize="9" rounded="lg" flexShrink="0" />
      </Flex>
    </Flex>
  );
}
