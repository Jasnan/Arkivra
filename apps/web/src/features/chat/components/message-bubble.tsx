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

  return (
    <Flex gap="3" minW="0" w="full" maxW="100%" overflow="hidden" justify={isUser ? 'flex-end' : 'flex-start'}>
      {!isUser ? (
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
          <Bot size={16} />
        </Flex>
      ) : null}

      <Box minW="0" maxW={isUser ? 'min(38rem, calc(100% - 3rem))' : 'min(44rem, calc(100% - 3rem))'} w={isUser ? undefined : '100%'}>
        {isUser ? (
          <>
            <Flex direction="column" align="flex-end" w="100%">
              <Box rounded="xl" bg="teal.solid" px="4" py="3" fontSize="sm" lineHeight="1.6" color="fg.inverted" maxW="min(38rem, 100%)" shadow="sm">
                <Text whiteSpace="pre-wrap" overflowWrap="anywhere">{displayContent}</Text>
              </Box>
            </Flex>
          </>
        ) : (
          <Box minW="0" w="100%" maxW="full" overflow="hidden" rounded="lg" bg="bg.surface" px={{ base: '4', md: '5' }} py={{ base: '3', md: '4' }} fontSize="sm" lineHeight="1.75" color="fg" borderWidth="1px" borderColor="border.subtle" shadow="xs">
            <MarkdownMessage
              content={displayContent}
              citations={message.citations}
              onCitationClick={(citation) => setSelectedCitation(citation)}
            />
            {renderMetricsSummary(metrics) ? (
              <Text mt="3" fontSize="xs" color="fg.muted">
                {renderMetricsSummary(metrics)}
              </Text>
            ) : null}
            {message.metadata?.quickReplies?.length && onQuickReplySelect ? (
              <Flex mt="3" gap="2" flexWrap="wrap">
                {message.metadata.quickReplies.map((reply) => (
                  <Button
                    key={reply}
                    type="button"
                    variant="outline"
                    size="sm"
                    style={{ height: 'auto', borderRadius: '9999px', padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                    onClick={() => onQuickReplySelect(reply)}
                  >
                    {reply}
                  </Button>
                ))}
              </Flex>
            ) : null}
            <SourcesAccordion currentVaultId={currentVaultId} citations={message.citations} />
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
          bg="teal.subtle"
          color="teal.fg"
        >
          <User size={16} />
        </Flex>
      ) : null}
    </Flex>
  );
}
