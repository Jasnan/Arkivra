import { Box, Flex, Skeleton, Status, Text, chakra } from '@chakra-ui/react';
import { MessagePrimitive, ThreadPrimitive, useMessage } from '@assistant-ui/react';
import { ArrowDown, Bot, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatApiScope } from '../chat.api';
import type { ChatGenerationMetrics, ChatStreamStatus, Citation } from '../chat.types';
import type { LocalMessage } from './chat-utils';
import { formatDate, renderMetricsSummary, statusLabel } from './chat-utils';
import { MarkdownMessage, normalizeChatDisplayContent } from './markdown-message';
import { SourcesAccordion } from './sources-accordion';
import { CitationPreviewModal } from './citation-preview-modal';
import { createContext, useContext, useState } from 'react';

const ThreadRoot = chakra(ThreadPrimitive.Root);
const ThreadViewport = chakra(ThreadPrimitive.Viewport);
const ScrollToBottomButton = chakra(ThreadPrimitive.ScrollToBottom);

interface AssistantMessageCustom {
  arkivraMessage?: LocalMessage;
  arkivraActiveStatus?: ChatStreamStatus | null;
  arkivraStreamingPlaceholder?: boolean;
}

interface AssistantChatThreadContextValue {
  currentVaultId?: string;
  scope: ChatApiScope;
  metricsByMessageId: Record<string, ChatGenerationMetrics | undefined>;
  onQuickReplySelect?: (reply: string) => void;
}

const AssistantChatThreadContext = createContext<AssistantChatThreadContextValue | null>(null);

function useArkivraMessageFromRuntime() {
  return useMessage((message) => message.metadata.custom as AssistantMessageCustom).arkivraMessage ?? null;
}

function useAssistantChatThreadContext() {
  const context = useContext(AssistantChatThreadContext);
  if (context === null) {
    throw new Error('Assistant chat thread context is unavailable.');
  }
  return context;
}

export function AssistantChatThread({
  currentVaultId,
  scope,
  metricsByMessageId,
  onQuickReplySelect,
}: {
  currentVaultId?: string;
  scope: ChatApiScope;
  metricsByMessageId: Record<string, ChatGenerationMetrics | undefined>;
  onQuickReplySelect?: (reply: string) => void;
}) {
  return (
    <AssistantChatThreadContext.Provider value={{ currentVaultId, scope, metricsByMessageId, onQuickReplySelect }}>
      <ThreadRoot h="full" minH="0" minW="0" position="relative">
        <ThreadViewport
          h="full"
          minH="0"
          minW="0"
          overflowY="auto"
          overflowX="hidden"
          autoScroll
          scrollToBottomOnInitialize
          scrollToBottomOnThreadSwitch
          scrollToBottomOnRunStart
        >
          <Box
            role="log"
            aria-label="Conversation timeline"
            aria-live="polite"
            aria-relevant="additions text"
            mx="auto"
            minW="0"
            w="100%"
            maxW="72rem"
            px="4"
            pt={{ base: '5', md: '6' }}
            pb="12"
            sm={{ px: '6' }}
          >
            <Flex direction="column" gap="4" minW="0" w="full">
              <ThreadPrimitive.Messages
                components={{
                  UserMessage: AssistantUserMessage,
                  AssistantMessage: AssistantResponseMessage,
                }}
              />
            </Flex>
          </Box>
        </ThreadViewport>

        <Box position="absolute" right={{ base: '4', md: '6' }} bottom="5" zIndex="1">
          <Tooltip>
            <TooltipTrigger asChild>
              <ScrollToBottomButton
                behavior="smooth"
                type="button"
                aria-label="Scroll to latest message"
                shadow="lg"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                boxSize="2.25rem"
                rounded="full"
                bg="teal.solid"
                color="fg.inverted"
                _hover={{ bg: 'teal.emphasized' }}
                _disabled={{ display: 'none' }}
              >
                <ArrowDown size={16} />
              </ScrollToBottomButton>
            </TooltipTrigger>
            <TooltipContent>Latest message</TooltipContent>
          </Tooltip>
        </Box>
      </ThreadRoot>
    </AssistantChatThreadContext.Provider>
  );
}

function AssistantUserMessage() {
  const message = useArkivraMessageFromRuntime();

  if (!message) return null;

  return (
    <MessagePrimitive.Root>
      <Flex gap="4" minW="0" w="full" maxW="100%" overflow="hidden" justify="flex-end">
        <Box minW="0" maxW="min(38rem, calc(100% - 3rem))">
          <Flex direction="column" align="flex-end" w="100%">
            <Box rounded="xl" bg="teal.solid" px="4" py="3" textStyle="chat" color="fg.inverted" maxW="min(38rem, 100%)" shadow="sm">
              <Text whiteSpace="pre-wrap" overflowWrap="anywhere">
                {normalizeChatDisplayContent(message.content)}
              </Text>
            </Box>
          </Flex>
          {!message.localOnly ? (
            <Text mt="1" fontSize="xs" color="fg.muted">
              {formatDate(message.createdAt)}
            </Text>
          ) : null}
        </Box>
        <Flex
          mt="1"
          boxSize="9"
          shrink="0"
          align="center"
          justify="center"
          rounded="lg"
          bg="bg.subtle"
          color="fg.muted"
        >
          <User size={16} />
        </Flex>
      </Flex>
    </MessagePrimitive.Root>
  );
}

function AssistantResponseMessage() {
  const { currentVaultId, scope, metricsByMessageId, onQuickReplySelect } = useAssistantChatThreadContext();
  const message = useArkivraMessageFromRuntime();
  const custom = useMessage((state) => state.metadata.custom as AssistantMessageCustom);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  if (!message) return null;

  const displayContent = normalizeChatDisplayContent(message.content);
  const isStreamingPlaceholder = custom.arkivraStreamingPlaceholder === true;
  const metrics = metricsByMessageId[message.id] ?? message.generationMetrics ?? undefined;
  const metricsSummary = renderMetricsSummary(metrics);
  const responseFooter = [
    message.metadata?.model ?? null,
    metricsSummary,
  ].filter(Boolean).join(' • ');

  return (
    <MessagePrimitive.Root>
      <Flex gap="4" minW="0" w="full" maxW="100%" overflow="hidden">
        <Flex
          mt="0"
          boxSize="11"
          shrink="0"
          align="center"
          justify="center"
          rounded="full"
          bg={isStreamingPlaceholder ? 'teal.solid' : 'bg.subtle'}
          color={isStreamingPlaceholder ? 'fg.inverted' : 'fg.muted'}
          shadow="sm"
        >
          {isStreamingPlaceholder ? <Sparkles size={18} /> : <Bot size={18} />}
        </Flex>

        <Box minW="0" w="100%" maxW="min(56rem, calc(100% - 3.75rem))">
          <Box minW="0" w="100%" maxW="full" overflow="hidden" rounded="xl" bg="bg.surface" color="fg" borderWidth="1px" borderColor="border.surface" shadow="sm">
            <Box px={{ base: '5', md: '7' }} py={{ base: '4', md: '5' }} textStyle="chat">
              {displayContent.length > 0 ? (
                <MarkdownMessage
                  content={displayContent}
                  citations={message.citations}
                  onCitationClick={(citation) => setSelectedCitation(citation)}
                />
              ) : (
                <StreamingAnswerSkeleton label={statusLabel(custom.arkivraActiveStatus ?? null, scope)} />
              )}
            </Box>

            {message.metadata?.quickReplies?.length && onQuickReplySelect ? (
              <Flex px={{ base: '5', md: '7' }} pb="4" gap="2" flexWrap="wrap">
                {message.metadata.quickReplies.map((reply) => (
                  <Button
                    key={reply}
                    type="button"
                    variant="outline"
                    size="sm"
                    style={{ height: 'auto', borderRadius: '9999px', padding: '0.375rem 0.75rem', fontSize: 'var(--arkivra-font-size-label)' }}
                    onClick={() => onQuickReplySelect(reply)}
                  >
                    {reply}
                  </Button>
                ))}
              </Flex>
            ) : null}

            {responseFooter || message.citations.length > 0 ? (
              <Box borderTopWidth="1px" borderColor="border.surface" bg="bg.subtle" px={{ base: '5', md: '7' }} py="3">
                {responseFooter ? (
                  <Text fontSize="xs" color="fg.muted">
                    {responseFooter}
                  </Text>
                ) : null}
                <SourcesAccordion currentVaultId={currentVaultId} citations={message.citations} />
              </Box>
            ) : null}
          </Box>

          {!message.localOnly || (message.generationStatus === 'failed' && message.generationError) ? (
            <Text mt="1" fontSize="xs" color="fg.muted">
              {message.localOnly ? statusLabel(custom.arkivraActiveStatus ?? null, scope) : formatDate(message.createdAt)}
              {message.generationStatus === 'failed' && message.generationError ? (
                <Text as="span" ml="2" color="fg.error">{message.generationError}</Text>
              ) : null}
            </Text>
          ) : null}

          <CitationPreviewModal
            citation={selectedCitation}
            open={selectedCitation !== null}
            onOpenChange={(open) => {
              if (!open) setSelectedCitation(null);
            }}
          />
        </Box>
      </Flex>
    </MessagePrimitive.Root>
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
