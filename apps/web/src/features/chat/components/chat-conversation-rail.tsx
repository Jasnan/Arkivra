import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatConversation } from '../chat.types';
import type { useChatConversationsQuery } from '../chat.queries';
import { formatDate, NEW_CHAT_DRAFT_ID } from './chat-utils';

export function ChatConversationRail({
  showHeader = true,
  conversationsQuery,
  conversationSections,
  selectedChatId,
  effectiveSelectedChatId,
  createConversationPending,
  onCreateConversation,
  onSelectConversation,
  onDeleteConversation,
}: {
  showHeader?: boolean;
  conversationsQuery: ReturnType<typeof useChatConversationsQuery>;
  conversationSections: Array<[string, ChatConversation[]]>;
  selectedChatId: string;
  effectiveSelectedChatId: string;
  createConversationPending: boolean;
  onCreateConversation: () => void;
  onSelectConversation: (chatId: string) => void;
  onDeleteConversation: (chatId: string) => void;
}) {
  return (
    <>
      {showHeader ? (
        <Flex align="center" justify="space-between" gap="3" py="2">
          <Flex align="center" gap="2" fontSize="sm" fontWeight="semibold" color="text.default">
            <MessageSquare size={16} color="var(--chakra-colors-accent-default)" />
            Conversations
          </Flex>
          <Button
            type="button"
            variant="ghost"
            onClick={onCreateConversation}
            disabled={createConversationPending}
            style={{ height: '2.25rem', borderRadius: '9999px', padding: '0 0.75rem' }}
          >
            <Plus size={16} />
            New chat
          </Button>
        </Flex>
      ) : (
        <Flex justify="flex-end" pb="2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCreateConversation}
            disabled={createConversationPending}
            style={{ height: '2.25rem', borderRadius: '9999px', padding: '0 0.75rem' }}
          >
            <Plus size={16} />
            New chat
          </Button>
        </Flex>
      )}

      <Box
        minH="0"
        flex="1"
        overflowY="auto"
        pr="1"
        mt={showHeader ? '4' : '2'}
      >
        {conversationsQuery.isLoading ? (
          <Flex align="center" gap="2" py="4" fontSize="sm" color="text.muted">
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Loading chats
          </Flex>
        ) : conversationSections.length === 0 ? (
          <Text py="4" fontSize="sm" color="text.muted">No conversations yet.</Text>
        ) : (
          <Flex direction="column" gap="5">
            {conversationSections.map(([sectionLabel, conversations]) => (
              <Flex key={sectionLabel} direction="column" gap="2">
                <Text fontSize="xs" fontWeight="medium" color="text.muted">{sectionLabel}</Text>
                <Flex direction="column" gap="1">
                  {conversations.map((conversation) => (
                    <Flex key={conversation.id} className="group" align="center" gap="1">
                      <chakra.button
                        type="button"
                        minW="0"
                        flex="1"
                        rounded="xl"
                        px="3"
                        py="3"
                        textAlign="left"
                        fontSize="sm"
                        bg={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? 'surface.selected' : undefined}
                        color={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? 'text.default' : 'text.muted'}
                        cursor="pointer"
                        _hover={selectedChatId !== conversation.id && effectiveSelectedChatId !== conversation.id ? { bg: 'surface.subtle', color: 'text.default' } : undefined}
                        onClick={() => onSelectConversation(conversation.id)}
                      >
                        <Text truncate fontWeight="medium">{conversation.title}</Text>
                        <Text mt="1" fontSize="xs" color="text.muted">
                          {formatDate(conversation.updatedAt)}
                        </Text>
                      </chakra.button>
                      {conversation.id === NEW_CHAT_DRAFT_ID ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${conversation.title}`}
                          style={{ height: '2rem', width: '2rem', borderRadius: '9999px', flexShrink: 0 }}
                          onClick={() => onDeleteConversation(conversation.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </Flex>
                  ))}
                </Flex>
              </Flex>
            ))}
          </Flex>
        )}
      </Box>
    </>
  );
}
