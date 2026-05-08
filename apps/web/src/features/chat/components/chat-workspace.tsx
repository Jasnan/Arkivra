import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Flex, Text } from '@chakra-ui/react';
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
}: ChatWorkspaceProps) {
  const isFullHeight = heightClassName === 'h-full';
  const { vaultId, documentId } = scope;
  const isDocumentChat = Boolean(vaultId && documentId);
  const isGlobalChat = !vaultId;
  const experience = getChatExperienceConfig({ scope, documentName });
  const queryClient = useQueryClient();
  const conversationsQuery = useChatConversationsQuery(scope);
  const modelOptionsQuery = useChatModelOptionsQuery(scope);
  const createConversation = useCreateChatConversationMutation();
  const deleteConversation = useDeleteChatConversationMutation();
  const [selectedChatId, setSelectedChatId] = useState('');
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [streamStatus, setStreamStatus] = useState<ChatStreamStatus | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [responseMode, setResponseMode] = useState<ChatResponseMode>('multimodal');
  const [selectedModel, setSelectedModel] = useState('');
  const [composerValue, setComposerValue] = useState('');
  const [currentIntent, setCurrentIntent] = useState<ChatIntent | null>(null);
  const [metricsByMessageId, setMetricsByMessageId] = useState<ChatMetricsByMessageId>({});
  const [isDesktopConversationRailCollapsed, setIsDesktopConversationRailCollapsed] =
    useState(false);
  const [isMobileConversationRailOpen, setIsMobileConversationRailOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isStreaming = streamStatus !== null;
  const isDraftConversation = selectedChatId === NEW_CHAT_DRAFT_ID;
  const effectiveSelectedChatId = isDraftConversation
    ? ''
    : selectedChatId || conversationsQuery.data?.conversations[0]?.id || '';
  const selectedChatQuery = useChatConversationQuery({
    ...scope,
    chatId: effectiveSelectedChatId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedChatQuery.data?.conversation.messages, localMessages, streamingText]);

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
        createdBy: null,
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

  function focusComposer() {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }

  function resetComposerState() {
    setLocalMessages([]);
    setStreamingText('');
    setStreamError(null);
    setComposerValue('');
    setCurrentIntent(null);
    setMetricsByMessageId({});
  }

  function handleCreateConversation() {
    setSelectedChatId(NEW_CHAT_DRAFT_ID);
    setIsMobileConversationRailOpen(false);
    resetComposerState();
  }

  async function handleDeleteConversation(chatId: string) {
    await deleteConversation.mutateAsync({ ...scope, chatId });
    if (selectedChatId === chatId) setSelectedChatId('');
    await queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) });
  }

  function handleGuidedPromptSelect(prompt: GlobalGuidedPrompt) {
    setCurrentIntent(prompt.id);
    setComposerValue(prompt.prefill);
    focusComposer();
  }

  async function handleSend(content: string, intentOverride?: ChatIntent | null) {
    setStreamError(null);
    setStreamingText('');
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
      createdBy: null,
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
          setStreamStatus(null);
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) }),
            queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(scope, chatId) }),
          ]);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send message.';
      setStreamError(message);
      toast.error(message);
      setStreamStatus(null);
    }
  }

  return (
    <Box
      display="grid"
      position="relative"
      h={isFullHeight ? 'full' : 'calc(100vh - 14rem)'}
      minH={isFullHeight ? '0' : '32rem'}
      overflow="hidden"
      gridTemplateColumns={{
        base: '1fr',
        lg: isDesktopConversationRailCollapsed ? '0 minmax(0, 1fr)' : '14rem minmax(0, 1fr)',
      }}
    >
      <Box
        as="aside"
        display={{ base: 'none', lg: 'flex' }}
        flexDirection="column"
        minH="0"
        overflow="hidden"
        borderRightWidth={isDesktopConversationRailCollapsed ? '0' : '1px'}
        borderColor="border.subtle"
        pb="6"
        transition="width,padding,opacity 200ms ease-linear"
        width={isDesktopConversationRailCollapsed ? '0' : '14rem'}
        pr={isDesktopConversationRailCollapsed ? '0' : '5'}
        opacity={isDesktopConversationRailCollapsed ? '0' : '1'}
        aria-hidden={isDesktopConversationRailCollapsed}
      >
        <ChatConversationRail
          conversationsQuery={conversationsQuery}
          conversationSections={conversationSections}
          selectedChatId={selectedChatId}
          effectiveSelectedChatId={effectiveSelectedChatId}
          createConversationPending={createConversation.isPending}
          onCreateConversation={() => {
            void handleCreateConversation();
          }}
          onSelectConversation={(chatId) => {
            setSelectedChatId(chatId);
            resetComposerState();
          }}
          onDeleteConversation={(chatId) => {
            void handleDeleteConversation(chatId);
          }}
        />
      </Box>

      <Box
        display={{ base: 'none', lg: 'flex' }}
        position="absolute"
        top="0.5rem"
        left={isDesktopConversationRailCollapsed ? '0.5rem' : '12.875rem'}
        zIndex="dropdown"
        transition="left 200ms ease-linear"
      >
        <Button
          type="button"
          variant="ghost"
          aria-label={isDesktopConversationRailCollapsed ? 'Show conversation list' : 'Hide conversation list'}
          style={{ height: '2.25rem', width: '2.25rem', borderRadius: '9999px', padding: 0 }}
          onClick={() => setIsDesktopConversationRailCollapsed((current) => !current)}
        >
          {isDesktopConversationRailCollapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </Button>
      </Box>

      <Box
        as="section"
        display="grid"
        gridTemplateRows="auto 1fr auto"
        h="100%"
        minH="0"
        maxH="100%"
        overflow="hidden"
        lg={!isDesktopConversationRailCollapsed ? { pl: '6' } : undefined}
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

          <Box
            display={{ base: 'block', lg: 'none' }}
            borderBottomWidth="1px"
              borderColor="border"
            px="4"
            py="3"
            sm={{ px: '6' }}
          >
            <Collapsible
              open={isMobileConversationRailOpen}
              onOpenChange={setIsMobileConversationRailOpen}
            >
              <Flex align="center" justify="space-between" gap="3">
                <Flex align="center" gap="2" fontSize="sm" fontWeight="medium" color="fg">
                  <MessageSquare size={16} color="var(--chakra-colors-teal-solid)" />
                  Conversations
                </Flex>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    style={{ height: '2.25rem', borderRadius: '9999px', padding: '0 0.75rem' }}
                  >
                    <PanelLeftOpen size={16} />
                    {isMobileConversationRailOpen ? 'Hide history' : 'Show history'}
                  </Button>
                </CollapsibleTrigger>
              </Flex>
              <CollapsibleContent
                style={{
                  overflow: 'hidden',
                  animationTimingFunction: 'ease',
                }}
                _open={{ animationName: 'accordion-down' }}
                _closed={{ animationName: 'accordion-up' }}
              >
                <Box mt="4"                 borderTopWidth="1px" borderColor="border" pt="3">
                  <ChatConversationRail
                    showHeader={false}
                    conversationsQuery={conversationsQuery}
                    conversationSections={conversationSections}
                    selectedChatId={selectedChatId}
                    effectiveSelectedChatId={effectiveSelectedChatId}
                    createConversationPending={createConversation.isPending}
                    onCreateConversation={() => {
                      void handleCreateConversation();
                    }}
                    onSelectConversation={(chatId) => {
                      setSelectedChatId(chatId);
                      setIsMobileConversationRailOpen(false);
                      resetComposerState();
                    }}
                    onDeleteConversation={(chatId) => {
                      void handleDeleteConversation(chatId);
                    }}
                  />
                </Box>
              </CollapsibleContent>
            </Collapsible>
          </Box>
        </Box>

        <Box minH="0" flex="1" overflowY="auto">
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
            <Flex
              minH="24rem"
              align="center"
              justify="center"
              gap="2"
              px="6"
              py="10"
              fontSize="sm"
              color="fg.muted"
            >
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Loading conversation
            </Flex>
          ) : (
            <Flex
              direction="column"
              gap="4"
              mx="auto"
              w="100%"
              maxW="72rem"
              px="4"
              pt="6"
              pb="20"
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
                    rounded="xl"
                    bg="teal.solid"
                    color="fg.inverted"
                  >
                    <Sparkles size={16} />
                  </Flex>
                  <Box maxW="min(44rem, 100%)">
                    <Box
                      rounded="2xl"
                      bg="bg.elevated"
                      px="4"
                      py="3"
                      fontSize="sm"
                      lineHeight="1.6"
                      color="fg"
                      borderWidth="1px"
                      borderColor="border.subtle"
                    >
                      {streamingText.length > 0 ? (
                        <MarkdownMessage content={streamingText} citations={[]} />
                      ) : (
                        <Flex align="center" gap="2" color="fg.muted">
                          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                          {statusLabel(streamStatus, scope)}
                        </Flex>
                      )}
                    </Box>
                    <Text mt="2" fontSize="xs" color="fg.muted">
                      {statusLabel(streamStatus, scope)}
                    </Text>
                  </Box>
                </Flex>
              ) : null}
              <div ref={messagesEndRef} />
            </Flex>
          )}
        </Box>

        <ChatInputPanel
          disabled={isStreaming || createConversation.isPending}
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
