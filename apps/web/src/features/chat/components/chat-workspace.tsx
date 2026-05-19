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
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useWorkspaceSecondary } from '@/components/layout/workspace-context';
import { useVaultQuery, useVaultsQuery } from '@/features/vaults/vaults.queries';
import type { ChatApiScope, ChatResponseMode } from '../chat.api';
import { streamChatMessage } from '../chat.api';
import {
  chatQueryKeys,
  useChatConversationQuery,
  useChatConversationsQuery,
  useCreateChatConversationMutation,
  useDeleteChatConversationMutation,
  useChatModelOptionsQuery,
} from '../chat.queries';
import type { ChatContextSnapshot, ChatConversation, ChatIntent, ChatStreamStatus } from '../chat.types';
import type { DraftChatContext, DraftChatDocument, DraftChatVault } from './chat-context-selector';
import type {
  ChatMetricsByMessageId,
  ChatWorkspaceProps,
  GlobalGuidedPrompt,
  LocalMessage,
} from './chat-utils';
import {
  GLOBAL_GUIDED_PROMPTS,
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
import { ChatInputPanel } from './chat-input-panel';
import { VirtualChatTimeline } from './virtual-chat-timeline';

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
    return 'Root accounts can administratively access this vault, but vault chat requires explicit vault membership with full AI access.';
  }

  if (snapshot.type === 'selection') {
    return 'Selected context includes vaults or documents without the required AI access.';
  }

  return 'Root accounts can administratively access all vaults, but global chat retrieval requires explicit vault membership with full AI access.';
}

function canUseContextSnapshot({
  snapshot,
  aiAccessByVaultId,
  hasFullAiVault,
}: {
  snapshot: ChatContextSnapshot;
  aiAccessByVaultId: Map<string, 'none' | 'document_chat' | 'full'>;
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
    const access = aiAccessByVaultId.get(snapshot.vaultId);
    return access === 'document_chat' || access === 'full';
  }

  if (snapshot.vaults.length === 0 && snapshot.documents.length === 0) {
    return false;
  }

  return (
    snapshot.vaults.every(vault => aiAccessByVaultId.get(vault.vaultId) === 'full')
    && snapshot.documents.every((document) => {
      const access = aiAccessByVaultId.get(document.vaultId);
      return access === 'document_chat' || access === 'full';
    })
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
  const deleteConversation = useDeleteChatConversationMutation();
  const vaultsQuery = useVaultsQuery();
  const initialDraftContext = useMemo(
    () => getDraftContextFromScope({ vaultId, documentId, documentName }),
    [documentId, documentName, vaultId],
  );
  const [selectedChatId, setSelectedChatId] = useState(selectedConversationId ?? '');
  const [draftContext, setDraftContext] = useState<DraftChatContext>(initialDraftContext);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [streamStatus, setStreamStatus] = useState<ChatStreamStatus | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isAssistantResponsePending, setIsAssistantResponsePending] = useState(false);
  const [responseMode, setResponseMode] = useState<ChatResponseMode>('text');
  const [selectedModel, setSelectedModel] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [currentIntent, setCurrentIntent] = useState<ChatIntent | null>(null);
  const [metricsByMessageId, setMetricsByMessageId] = useState<ChatMetricsByMessageId>({});
  const [isMobileConversationRailOpen, setIsMobileConversationRailOpen] = useState(false);
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [pendingForkContext, setPendingForkContext] = useState<DraftChatContext | null>(null);
  const [isForkDialogOpen, setIsForkDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isStreaming = isAssistantResponsePending || streamStatus !== null;
  const shouldAutoSelectLatestConversation = !vaultId && !documentId && selectedConversationId === undefined;
  const isDraftConversation = selectedChatId === NEW_CHAT_DRAFT_ID;
  const effectiveSelectedChatId = isDraftConversation
    ? ''
    : selectedChatId || (shouldAutoSelectLatestConversation ? conversationsQuery.data?.conversations[0]?.id : '') || '';
  const selectedChatQuery = useChatConversationQuery({ chatId: effectiveSelectedChatId });
  const hydratedDraftContext = useMemo(
    () => hydrateDraftContextLabels({ context: draftContext, vaults: vaultsQuery.data?.vaults ?? [] }),
    [draftContext, vaultsQuery.data?.vaults],
  );
  const draftContextSnapshot = useMemo(
    () => contextSnapshotFromDraft(hydratedDraftContext),
    [hydratedDraftContext],
  );
  const lockedContextSnapshot = selectedChatQuery.data?.conversation.contextSnapshot ?? null;
  const activeContextSnapshot = lockedContextSnapshot ?? draftContextSnapshot;
  const activeScope = scopeFromContextSnapshot(activeContextSnapshot);
  const displayedContext = useMemo(
    () => lockedContextSnapshot
      ? hydrateDraftContextLabels({
          context: draftContextFromSnapshot(lockedContextSnapshot),
          vaults: vaultsQuery.data?.vaults ?? [],
        })
      : hydratedDraftContext,
    [hydratedDraftContext, lockedContextSnapshot, vaultsQuery.data?.vaults],
  );
  const isContextLocked = effectiveSelectedChatId.length > 0;
  const activeVaultId = activeScope.vaultId;
  const activeDocumentId = activeScope.documentId;
  const isActiveDocumentChat = Boolean(activeVaultId && activeDocumentId);
  const isActiveGlobalChat = !activeVaultId;
  const experience = getChatExperienceConfig({ scope: activeScope, documentName });
  const vaultQuery = useVaultQuery({ vaultId: activeVaultId ?? '' });
  const vaultAiAccessLevel = activeVaultId ? vaultQuery.data?.vault.aiAccessLevel : undefined;
  const aiAccessByVaultId = useMemo(() => {
    const accessByVaultId = new Map<string, 'none' | 'document_chat' | 'full'>();
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
  const canUseChat = isContextAccessLoading || canUseContextSnapshot({
    snapshot: activeContextSnapshot,
    aiAccessByVaultId,
    hasFullAiVault,
  });
  const aiAccessMessage = getContextAccessMessage(activeContextSnapshot);

  const availableModels = modelOptionsQuery.data?.options.models ?? [];
  const defaultModel = modelOptionsQuery.data?.options.defaultModel ?? '';
  const resolvedSelectedModel =
    selectedModel && (availableModels.length === 0 || availableModels.includes(selectedModel))
      ? selectedModel
      : defaultModel || availableModels[0] || '';

  const messages = useMemo(
    () => [
      ...(selectedChatQuery.data?.conversation.messages ?? []),
      ...localMessages.filter((message) => message.conversationId === effectiveSelectedChatId),
    ],
    [effectiveSelectedChatId, localMessages, selectedChatQuery.data?.conversation.messages],
  );
  const activeConversationIntent = useMemo(() => getLatestIntent(messages), [messages]);
  const effectiveIntent = currentIntent ?? activeConversationIntent;
  const shouldShowEmptyState = messages.length === 0 && !isStreaming;
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
    setLocalMessages([]);
    setStreamingText('');
    setStreamError(null);
    setIsAssistantResponsePending(false);
    setComposerValue('');
    setCurrentIntent(null);
    setMetricsByMessageId({});
  }, []);

  useEffect(() => {
    if (selectedConversationId !== undefined && selectedConversationId !== selectedChatId) {
      setSelectedChatId(selectedConversationId);
      resetComposerState();
    }
  }, [resetComposerState, selectedChatId, selectedConversationId]);

  useEffect(() => {
    if (selectedConversationId === undefined && selectedChatId.length === 0) {
      setDraftContext(initialDraftContext);
    }
  }, [initialDraftContext, selectedChatId, selectedConversationId]);

  const handleCreateConversation = useCallback(() => {
    setSelectedChatId(NEW_CHAT_DRAFT_ID);
    setDraftContext(selectedConversationId === undefined ? initialDraftContext : createEmptyDraftContext());
    setIsMobileConversationRailOpen(false);
    resetComposerState();
    focusComposer();
  }, [focusComposer, initialDraftContext, resetComposerState, selectedConversationId]);

  const handleSelectConversation = useCallback((chatId: string) => {
    setSelectedChatId(chatId);
    resetComposerState();
    onConversationSelected?.(chatId);
  }, [onConversationSelected, resetComposerState]);

  const handleSelectMobileConversation = useCallback((chatId: string) => {
    handleSelectConversation(chatId);
    setIsMobileConversationRailOpen(false);
  }, [handleSelectConversation]);

  const handleDeleteConversation = useCallback(async (chatId: string) => {
    await deleteConversation.mutateAsync({ chatId });
    if (selectedChatId === chatId) setSelectedChatId('');
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() });
  }, [deleteConversation, queryClient, selectedChatId]);

  const handleDeleteConversationClick = useCallback((chatId: string) => {
    void handleDeleteConversation(chatId);
  }, [handleDeleteConversation]);

  function handleGuidedPromptSelect(prompt: GlobalGuidedPrompt) {
    setCurrentIntent(prompt.id);
    setComposerValue(prompt.prefill);
    focusComposer();
  }

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
    setStreamError(null);
    setStreamingText('');
    setIsAssistantResponsePending(true);
    const resolvedIntent = isActiveGlobalChat ? (intentOverride ?? effectiveIntent) : null;

    let chatId = effectiveSelectedChatId;
    if (!chatId) {
      const result = await createConversation.mutateAsync({
        contextSnapshot: contextSnapshotFromDraft(hydratedDraftContext),
        title: content,
      });
      chatId = result.conversation.id;
      setSelectedChatId(chatId);
      onConversationCreated?.(chatId);
      queryClient.setQueryData(chatQueryKeys.conversation(chatId), {
        conversation: { ...result.conversation, messages: [] },
      });
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() });
    }

    const optimisticMessage: LocalMessage = {
      id: `local-${Date.now()}`,
      conversationId: chatId,
      vaultId: activeVaultId ?? null,
      documentId: activeDocumentId ?? null,
      scope: isActiveDocumentChat ? 'document' : isActiveGlobalChat ? 'global' : 'vault',
      userId: null,
      role: 'user',
      content,
      metadata: resolvedIntent ? { intent: resolvedIntent } : null,
      citations: [],
      generationMetrics: null,
      generationStatus: null,
      generationError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      localOnly: true,
    };

    setLocalMessages([optimisticMessage]);

    try {
      await streamChatMessage({
        chatId,
        content,
        intent: resolvedIntent ?? undefined,
        model: resolvedSelectedModel || undefined,
        responseMode,
        onStatus: setStreamStatus,
        onToken: (token) => setStreamingText((current) => `${current}${token}`),
        onError: (message) => {
          setStreamError(message);
          setLocalMessages([]);
          setIsAssistantResponsePending(false);
          setStreamStatus(null);
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() }),
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(chatId) }),
          ]);
        },
        onDone: (payload) => {
          setMetricsByMessageId((current) => ({
            ...current,
            [payload.assistantMessage.id]: payload.metrics ?? undefined,
          }));
          setLocalMessages([]);
          setStreamingText('');
          setIsAssistantResponsePending(false);
          setStreamStatus(null);
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations() }),
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(chatId) }),
          ]);
        },
      });
      setIsAssistantResponsePending(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send message.';
      setStreamError(message);
      toast.error(message);
      setIsAssistantResponsePending(false);
      setStreamStatus(null);
    }
  }

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
        lg: renderConversationRailInSecondary ? 'minmax(0, 1fr)' : '15rem minmax(0, 1fr)',
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
          {streamError ? (
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
              {streamError}
            </Flex>
          ) : null}
          {!canUseChat ? (
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
              {aiAccessMessage} Root status does not grant AI access.
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

        {shouldShowEmptyState ? (
          <ScrollArea.Root h="full" minH="0" minW="0" size="xs" variant="hover">
            <ScrollArea.Viewport h="full">
              <ScrollArea.Content minH="full">
                <ChatEmptyState
                  title={experience.emptyTitle}
                  description={experience.emptyDescription}
                  promptSuggestions={experience.promptSuggestions}
                  guidedPrompts={isActiveGlobalChat ? GLOBAL_GUIDED_PROMPTS : undefined}
                  onGuidedPromptSelect={isActiveGlobalChat ? handleGuidedPromptSelect : undefined}
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
          <VirtualChatTimeline
            conversationId={effectiveSelectedChatId}
            messages={messages}
            currentVaultId={activeVaultId}
            scope={activeScope}
            activeStatus={streamStatus}
            metricsByMessageId={metricsByMessageId}
            streamingText={streamingText}
            isStreaming={isStreaming}
            onQuickReplySelect={
              isActiveGlobalChat
                ? (reply) => {
                    void handleSend(reply, effectiveIntent);
                  }
                : undefined
            }
          />
        )}

        <ChatInputPanel
          disabled={!canUseChat || isStreaming || createConversation.isPending}
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
          value={composerValue}
          onValueChange={setComposerValue}
          textareaRef={textareaRef}
          onSubmit={handleSend}
        />
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
