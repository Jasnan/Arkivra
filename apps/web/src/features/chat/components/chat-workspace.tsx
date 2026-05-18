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
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useWorkspaceSecondary } from '@/components/layout/workspace-context';
import { useVaultQuery, useVaultsQuery } from '@/features/vaults/vaults.queries';
import { streamChatMessage } from '../chat.api';
import type { ChatResponseMode } from '../chat.api';
import {
  chatQueryKeys,
  useChatConversationQuery,
  useChatConversationsQuery,
  useCreateChatConversationMutation,
  useDeleteChatConversationMutation,
  useChatModelOptionsQuery,
} from '../chat.queries';
import type { ChatConversation, ChatIntent, ChatStreamStatus } from '../chat.types';
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
  statusLabel,
} from './chat-utils';
import { ChatConversationRail } from './chat-conversation-rail';
import { ChatEmptyState } from './chat-empty-state';
import { ChatInputPanel } from './chat-input-panel';
import { MarkdownMessage } from './markdown-message';
import { MessageBubble } from './message-bubble';

export function ChatWorkspace({
  scope,
  documentName,
  inputPlaceholder,
  heightClassName = 'h-[calc(100vh-14rem)] min-h-[32rem]',
  renderConversationRailInSecondary = false,
}: ChatWorkspaceProps) {
  const isFullHeight = heightClassName === 'h-full';
  const { vaultId, documentId } = scope;
  const isDocumentChat = Boolean(vaultId && documentId);
  const isGlobalChat = !vaultId;
  const experience = getChatExperienceConfig({ scope, documentName });
  const queryClient = useQueryClient();
  const conversationsQuery = useChatConversationsQuery(scope);
  const modelOptionsQuery = useChatModelOptionsQuery(scope);
  const vaultQuery = useVaultQuery({ vaultId: vaultId ?? '' });
  const vaultsQuery = useVaultsQuery();
  const createConversation = useCreateChatConversationMutation();
  const deleteConversation = useDeleteChatConversationMutation();
  const [selectedChatId, setSelectedChatId] = useState('');
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isStreaming = isAssistantResponsePending || streamStatus !== null;
  const vaultAiAccessLevel = vaultId ? vaultQuery.data?.vault.aiAccessLevel ?? 'none' : 'none';
  const hasFullAiVault = (vaultsQuery.data?.vaults ?? []).some((vault) => vault.aiAccessLevel === 'full');
  const canUseChat =
    isDocumentChat
      ? vaultQuery.isLoading || vaultAiAccessLevel === 'document_chat' || vaultAiAccessLevel === 'full'
      : isGlobalChat
        ? vaultsQuery.isLoading || hasFullAiVault
        : vaultQuery.isLoading || vaultAiAccessLevel === 'full';
  const aiAccessMessage = isDocumentChat
    ? 'Document chat requires document chat or full AI access on this vault.'
    : isGlobalChat
      ? 'Root accounts can administratively access all vaults, but global chat retrieval requires explicit vault membership with full AI access.'
      : 'Root accounts can administratively access this vault, but vault chat requires explicit vault membership with full AI access.';
  const isDraftConversation = selectedChatId === NEW_CHAT_DRAFT_ID;
  const effectiveSelectedChatId = isDraftConversation
    ? ''
    : selectedChatId || conversationsQuery.data?.conversations[0]?.id || '';
  const selectedChatQuery = useChatConversationQuery({
    ...scope,
    chatId: effectiveSelectedChatId,
  });

  const scrollToMessagesEnd = useCallback(() => {
    const scroll = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };

    if (typeof window.requestAnimationFrame !== 'function') {
      scroll();
      return undefined;
    }

    const frame = window.requestAnimationFrame(scroll);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return scrollToMessagesEnd();
  }, [isStreaming, localMessages, scrollToMessagesEnd, selectedChatQuery.data?.conversation.messages, streamingText]);

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
    return [
      {
        id: NEW_CHAT_DRAFT_ID,
        title: 'New chat',
        scope: isDocumentChat ? 'document' : isGlobalChat ? 'global' : 'vault',
        vaultId: vaultId ?? null,
        documentId: documentId ?? null,
        userId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...conversations,
    ];
  }, [
    conversationsQuery.data?.conversations,
    documentId,
    isDocumentChat,
    isDraftConversation,
    isGlobalChat,
    vaultId,
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

  const handleCreateConversation = useCallback(() => {
    setSelectedChatId(NEW_CHAT_DRAFT_ID);
    setIsMobileConversationRailOpen(false);
    resetComposerState();
    focusComposer();
  }, [focusComposer, resetComposerState]);

  const handleSelectConversation = useCallback((chatId: string) => {
    setSelectedChatId(chatId);
    resetComposerState();
  }, [resetComposerState]);

  const handleSelectMobileConversation = useCallback((chatId: string) => {
    handleSelectConversation(chatId);
    setIsMobileConversationRailOpen(false);
  }, [handleSelectConversation]);

  const handleDeleteConversation = useCallback(async (chatId: string) => {
    await deleteConversation.mutateAsync({ ...scope, chatId });
    if (selectedChatId === chatId) setSelectedChatId('');
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) });
  }, [deleteConversation, queryClient, scope, selectedChatId]);

  const handleDeleteConversationClick = useCallback((chatId: string) => {
    void handleDeleteConversation(chatId);
  }, [handleDeleteConversation]);

  function handleGuidedPromptSelect(prompt: GlobalGuidedPrompt) {
    setCurrentIntent(prompt.id);
    setComposerValue(prompt.prefill);
    focusComposer();
  }

  async function handleSend(content: string, intentOverride?: ChatIntent | null) {
    setStreamError(null);
    setStreamingText('');
    setIsAssistantResponsePending(true);
    const resolvedIntent = isGlobalChat ? (intentOverride ?? effectiveIntent) : null;

    let chatId = effectiveSelectedChatId;
    if (!chatId) {
      const result = await createConversation.mutateAsync({ ...scope, title: content });
      chatId = result.conversation.id;
      setSelectedChatId(chatId);
      queryClient.setQueryData(chatQueryKeys.conversation(scope, chatId), {
        conversation: { ...result.conversation, messages: [] },
      });
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) });
    }

    const optimisticMessage: LocalMessage = {
      id: `local-${Date.now()}`,
      conversationId: chatId,
      vaultId: vaultId ?? null,
      documentId: documentId ?? null,
      scope: isDocumentChat ? 'document' : isGlobalChat ? 'global' : 'vault',
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
        ...scope,
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
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) }),
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(scope, chatId) }),
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
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) }),
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(scope, chatId) }),
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

        <ScrollArea.Root h="full" minH="0" minW="0" size="xs" variant="hover">
          <ScrollArea.Viewport h="full">
            <ScrollArea.Content minH="full">
              {shouldShowEmptyState ? (
                <ChatEmptyState
                  title={experience.emptyTitle}
                  description={experience.emptyDescription}
                  promptSuggestions={experience.promptSuggestions}
                  guidedPrompts={isGlobalChat ? GLOBAL_GUIDED_PROMPTS : undefined}
                  onGuidedPromptSelect={isGlobalChat ? handleGuidedPromptSelect : undefined}
                  onPromptSelect={(prompt) => {
                    void handleSend(prompt);
                  }}
                />
              ) : selectedChatQuery.isLoading && messages.length === 0 ? (
                <ChatConversationSkeleton />
              ) : (
                <Flex
                  direction="column"
                  gap="4"
                  mx="auto"
                  minW="0"
                  w="100%"
                  maxW="72rem"
                  overflowX="hidden"
                  px="4"
                  pt={{ base: '5', md: '6' }}
                  pb="12"
                  sm={{ px: '6' }}
                >
                  <Box mt="auto" aria-hidden="true" />
                  {messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      currentVaultId={vaultId}
                      scope={scope}
                      activeStatus={streamStatus}
                      metrics={metricsByMessageId[message.id] ?? message.generationMetrics ?? undefined}
                      onQuickReplySelect={
                        isGlobalChat
                          ? (reply) => {
                              void handleSend(reply, effectiveIntent);
                            }
                          : undefined
                      }
                    />
                  ))}
                  {streamingText.length > 0 || isStreaming ? (
                    <Flex gap="3">
                      <Flex
                        mt="1"
                        boxSize="9"
                        shrink="0"
                        align="center"
                        justify="center"
                        rounded="lg"
                        bg="teal.subtle"
                        color="teal.fg"
                      >
                        <Sparkles size={16} />
                      </Flex>
                      <Box w="100%" maxW="min(44rem, calc(100% - 3rem))">
                        <Box
                          rounded="lg"
                          bg="bg.surface"
                          px="5"
                          py="4"
                          fontSize="sm"
                          lineHeight="1.75"
                          color="fg"
                          borderWidth="1px"
                          borderColor="border.surface"
                        >
                          {streamingText.length > 0 ? (
                            <MarkdownMessage content={streamingText} citations={[]} />
                          ) : (
                            <StreamingAnswerSkeleton label={statusLabel(streamStatus, scope)} />
                          )}
                        </Box>
                      </Box>
                    </Flex>
                  ) : null}
                  <div ref={messagesEndRef} />
                </Flex>
              )}
            </ScrollArea.Content>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar bg="transparent">
            <ScrollArea.Thumb />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>

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
          value={composerValue}
          onValueChange={setComposerValue}
          textareaRef={textareaRef}
          onSubmit={handleSend}
        />
      </Box>
    </Box>
  );
}

function StreamingAnswerSkeleton({ label }: { label: string }) {
  return (
    <Flex direction="column" gap="3" w="100%" minW="12rem">
      <Status.Root colorPalette="teal" size="sm">
        <Status.Indicator />
        {label}
      </Status.Root>
      <Flex direction="column" gap="2" w="100%">
        <Skeleton h="3" w="100%" />
        <Skeleton h="3" w="92%" />
        <Skeleton h="3" w="72%" />
      </Flex>
    </Flex>
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
