import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
        <Flex align="center" justify="space-between" gap="3" px="4" py="4" borderBottomWidth="1px" borderColor="border.subtle">
          <Flex align="center" gap="2" fontSize="sm" fontWeight="semibold" color="fg">
            Conversations
          </Flex>
          <Button
            type="button"
            variant="outline"
            colorPalette="teal"
            onClick={onCreateConversation}
            disabled={createConversationPending}
            style={{ height: '2rem', borderRadius: '0.5rem', padding: '0 0.75rem' }}
          >
            <Text as="span" fontSize="xs" fontWeight="semibold">New chat</Text>
          </Button>
        </Flex>
      ) : (
        <Flex minW="0" maxW="full" justify="flex-end" pb="2">
          <Button
            type="button"
            variant="solid"
            colorPalette="teal"
            onClick={onCreateConversation}
            disabled={createConversationPending}
            style={{ height: '2rem', borderRadius: '0.5rem', padding: '0 0.75rem' }}
          >
            <Text as="span" fontSize="xs" fontWeight="semibold">New chat</Text>
          </Button>
        </Flex>
      )}

      <Box
        minH="0"
        minW="0"
        w="full"
        maxW="full"
        flex="1"
        overflowY="auto"
        overflowX="hidden"
        px={showHeader ? '4' : '0'}
        mt={showHeader ? '4' : '2'}
      >
        {conversationsQuery.isLoading ? (
          <Flex align="center" gap="2" py="4" fontSize="sm" color="fg.muted">
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Loading chats
          </Flex>
        ) : conversationSections.length === 0 ? (
          <Text py="4" fontSize="sm" color="fg.muted">No conversations yet.</Text>
        ) : (
          <Flex direction="column" gap="5" minW="0" w="full" maxW="full">
            {conversationSections.map(([sectionLabel, conversations]) => (
              <Flex key={sectionLabel} direction="column" gap="2" minW="0" w="full" maxW="full">
                <Text fontSize="xs" fontWeight="medium" color="fg.muted">{sectionLabel}</Text>
                <Flex direction="column" gap="1" minW="0" w="full" maxW="full">
                  {conversations.map((conversation) => (
                    <Flex key={conversation.id} className="group" position="relative" minW="0" w="full" maxW="full">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <chakra.button
                            type="button"
                            minW="0"
                            w="full"
                            maxW="full"
                            flex="1"
                            overflow="hidden"
                            rounded="md"
                            px="3"
                            py="2.5"
                            pr="8"
                            textAlign="left"
                            fontSize="sm"
                            bg={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? 'teal.subtle' : 'transparent'}
                            color={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? 'fg' : 'fg.muted'}
                            borderWidth="1px"
                            borderColor={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? 'teal.muted' : 'transparent'}
                            cursor="pointer"
                            _hover={selectedChatId !== conversation.id && effectiveSelectedChatId !== conversation.id ? { bg: 'bg.muted', color: 'fg' } : undefined}
                            onClick={() => onSelectConversation(conversation.id)}
                          >
                            <Text
                              as="span"
                              display="block"
                              minW="0"
                              maxW="100%"
                              overflow="hidden"
                              textOverflow="ellipsis"
                              whiteSpace="nowrap"
                              fontWeight="medium"
                            >
                              {conversation.title}
                            </Text>
                            <Text mt="0.5" fontSize="xs" color="fg.muted">
                              {formatDate(conversation.updatedAt)}
                            </Text>
                          </chakra.button>
                        </TooltipTrigger>
                        <TooltipContent>{conversation.title}</TooltipContent>
                      </Tooltip>
                      {conversation.id === NEW_CHAT_DRAFT_ID ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${conversation.title}`}
                          position="absolute"
                          right="1"
                          top="50%"
                          transform="translateY(-50%)"
                          opacity="0"
                          _groupHover={{ opacity: '1' }}
                          style={{ height: '1.5rem', width: '1.5rem', borderRadius: '9999px', flexShrink: 0 }}
                          onClick={() => onDeleteConversation(conversation.id)}
                        >
                          <Trash2 size={12} />
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
