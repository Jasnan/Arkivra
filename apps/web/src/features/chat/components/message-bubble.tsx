import { useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatApiScope } from '../chat.api';
import type { ChatGenerationMetrics, ChatStreamStatus, Citation } from '../chat.types';
import type { LocalMessage } from './chat-utils';
import { formatDate, renderMetricsSummary, statusLabel } from './chat-utils';
import { MarkdownMessage, normalizeChatDisplayContent } from './markdown-message';
import { SourcesAccordion } from './sources-accordion';
import { CitationPreviewModal } from './citation-preview-modal';

export function MessageBubble({
  message,
  currentVaultId,
  scope,
  activeStatus,
  metrics,
  onQuickReplySelect,
}: {
  message: LocalMessage;
  currentVaultId?: string;
  scope: ChatApiScope;
  activeStatus: ChatStreamStatus | null;
  metrics?: ChatGenerationMetrics;
  onQuickReplySelect?: (reply: string) => void;
}) {
  const isUser = message.role === 'user';
  const pendingStatusLabel = statusLabel(activeStatus, scope);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const displayContent = normalizeChatDisplayContent(message.content);
  const metricsSummary = renderMetricsSummary(metrics);
  const responseFooter = [
    !isUser && message.metadata?.model ? message.metadata.model : null,
    metricsSummary,
  ].filter(Boolean).join(' • ');

  return (
    <Flex gap="4" minW="0" w="full" maxW="100%" overflow="hidden" justify={isUser ? 'flex-end' : 'flex-start'}>
      {!isUser ? (
        <Flex
          mt="0"
          boxSize="11"
          shrink="0"
          align="center"
          justify="center"
          rounded="full"
          bg="bg.subtle"
          color="fg.muted"
          shadow="sm"
        >
          <Bot size={18} />
        </Flex>
      ) : null}

      <Box minW="0" maxW={isUser ? 'min(38rem, calc(100% - 3rem))' : 'min(56rem, calc(100% - 3.75rem))'} w={isUser ? undefined : '100%'}>
        {isUser ? (
          <>
            <Flex direction="column" align="flex-end" w="100%">
              <Box rounded="xl" bg="teal.solid" px="4" py="3" textStyle="chat" color="fg.inverted" maxW="min(38rem, 100%)" shadow="sm">
                <Text whiteSpace="pre-wrap" overflowWrap="anywhere">{displayContent}</Text>
              </Box>
            </Flex>
          </>
        ) : (
          <Box minW="0" w="100%" maxW="full" overflow="hidden" rounded="xl" bg="bg.surface" color="fg" borderWidth="1px" borderColor="border.surface" shadow="sm">
            <Box px={{ base: '5', md: '7' }} py={{ base: '4', md: '5' }} textStyle="chat">
              <MarkdownMessage
                content={displayContent}
                citations={message.citations}
                onCitationClick={(citation) => setSelectedCitation(citation)}
              />
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
        )}

        {!message.localOnly || (message.generationStatus === 'failed' && message.generationError) ? (
          <Text mt="1" fontSize="xs" color="fg.muted">
            {message.localOnly ? pendingStatusLabel : formatDate(message.createdAt)}
            {message.generationStatus === 'failed' && message.generationError ? (
              <Text as="span" ml="2" color="fg.error">{message.generationError}</Text>
            ) : null}
          </Text>
        ) : null}

        {!isUser ? (
          <CitationPreviewModal
            citation={selectedCitation}
            open={selectedCitation !== null}
            onOpenChange={(open) => {
              if (!open) setSelectedCitation(null);
            }}
          />
        ) : null}
      </Box>

      {isUser ? (
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
      ) : null}
    </Flex>
  );
}
