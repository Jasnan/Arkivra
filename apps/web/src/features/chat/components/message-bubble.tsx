import { useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatApiScope } from '../chat.api';
import type { ChatGenerationMetrics, ChatStreamStatus, Citation } from '../chat.types';
import type { LocalMessage } from './chat-utils';
import { formatDate, renderMetricsSummary, statusLabel } from './chat-utils';
import { MarkdownMessage } from './markdown-message';
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

  return (
    <Flex gap="3" justify={isUser ? 'flex-end' : 'flex-start'}>
      {!isUser ? (
        <Flex
          mt="1"
          boxSize="9"
          shrink="0"
          align="center"
          justify="center"
          rounded="lg"
          bg="accent.default"
          color="text.inverse"
        >
          <Bot size={16} />
        </Flex>
      ) : null}

      <Box maxW="min(46rem, 100%)" w={isUser ? undefined : '100%'}>
        {isUser ? (
          <>
            <Flex direction="column" align="flex-end" w="100%">
              <Box rounded="2xl" bg="accent.default" px="4" py="3" fontSize="sm" lineHeight="6" color="text.inverse" maxW="min(46rem, 100%)">
                <Text whiteSpace="pre-wrap">{message.content}</Text>
              </Box>
            </Flex>
          </>
        ) : (
          <Box w="100%" rounded="2xl" bg="surface.subtle" px="4" py="3" fontSize="sm" lineHeight="6" color="text.default">
            <MarkdownMessage
              content={message.content}
              citations={message.citations}
              onCitationClick={(citation) => setSelectedCitation(citation)}
            />
            {renderMetricsSummary(metrics) ? (
              <Text mt="3" fontSize="xs" color="text.muted">
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

        <Text mt="1" fontSize="xs" color="text.muted">
          {message.localOnly ? `${pendingStatusLabel}...` : formatDate(message.createdAt)}
          {message.generationStatus === 'failed' && message.generationError ? (
            <Text as="span" ml="2" color="status.danger">{message.generationError}</Text>
          ) : null}
        </Text>

        {!isUser ? (
          <CitationPreviewModal
            key={selectedCitation?.chunkId ?? 'no-inline-citation'}
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
          bg="surface.selected"
          color="text.muted"
        >
          <User size={16} />
        </Flex>
      ) : null}
    </Flex>
  );
}
