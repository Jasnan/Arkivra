import { useMemo, useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { CheckCircle2, Loader2, MessageSquarePlus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatConversation } from '../chat.types';
import type { useChatConversationsQuery } from '../chat.queries';
import { formatDate } from './chat-utils';

type ConversationContextFilter = 'all' | 'global' | 'vault' | 'document' | 'selection';
type ConversationTimeFilter = 'all' | 'today' | 'yesterday' | 'last7' | 'older';

const contextFilterOptions: Array<{ value: ConversationContextFilter; label: string }> = [
  { value: 'all', label: 'All contexts' },
  { value: 'global', label: 'All documents' },
  { value: 'vault', label: 'Vault chats' },
  { value: 'document', label: 'Document chats' },
  { value: 'selection', label: 'Selected context' },
];

const timeFilterOptions: Array<{ value: ConversationTimeFilter; label: string }> = [
  { value: 'all', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'older', label: 'Older' },
];

function getContextFilterValue(conversation: ChatConversation): Exclude<ConversationContextFilter, 'all'> {
  if (conversation.contextSnapshot.type === 'selection') return 'selection';
  if (conversation.contextSnapshot.type === 'global') return 'global';
  return conversation.scope;
}

function getDayDifference(value: string) {
  const date = new Date(value);
  const now = new Date();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24));
}

function matchesTimeFilter(conversation: ChatConversation, filter: ConversationTimeFilter) {
  if (filter === 'all') return true;

  const dayDifference = getDayDifference(conversation.updatedAt);
  if (filter === 'today') return dayDifference === 0;
  if (filter === 'yesterday') return dayDifference === 1;
  if (filter === 'last7') return dayDifference >= 0 && dayDifference <= 6;
  return dayDifference >= 7;
}

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
  const [searchQuery, setSearchQuery] = useState('');
  const [contextFilter, setContextFilter] = useState<ConversationContextFilter>('all');
  const [timeFilter, setTimeFilter] = useState<ConversationTimeFilter>('all');
  const activeFilterCount = (contextFilter === 'all' ? 0 : 1) + (timeFilter === 'all' ? 0 : 1);
  const filteredConversationSections = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return conversationSections
      .map(([sectionLabel, conversations]) => [
        sectionLabel,
        conversations.filter((conversation) => {
          const matchesSearch = normalizedQuery.length === 0
            || conversation.title.toLowerCase().includes(normalizedQuery);
          const matchesContext = contextFilter === 'all'
            || getContextFilterValue(conversation) === contextFilter;
          return matchesSearch && matchesContext && matchesTimeFilter(conversation, timeFilter);
        }),
      ] as [string, ChatConversation[]])
      .filter(([, conversations]) => conversations.length > 0);
  }, [contextFilter, conversationSections, searchQuery, timeFilter]);

  return (
    <>
      {showHeader ? (
        <Flex align="center" justify="space-between" gap="3" px="0" pt="6" pb="5">
          <Flex align="center" gap="2" fontSize="lg" fontWeight="semibold" color="fg">
            Conversations
          </Flex>
          <Button
            type="button"
            variant="outline"
            colorPalette="teal"
            aria-label="New chat"
            title="New chat"
            onClick={onCreateConversation}
            disabled={createConversationPending}
            style={{ height: '3rem', width: '3rem', borderRadius: '0.875rem', padding: '0' }}
          >
            <MessageSquarePlus size={19} />
          </Button>
        </Flex>
      ) : (
        <Flex minW="0" maxW="full" justify="flex-end" pb="2">
          <Button
            type="button"
            variant="solid"
            colorPalette="teal"
            aria-label="New chat"
            title="New chat"
            onClick={onCreateConversation}
            disabled={createConversationPending}
            style={{ height: '2rem', width: '2rem', borderRadius: '0.5rem', padding: '0' }}
          >
            <MessageSquarePlus size={16} />
          </Button>
        </Flex>
      )}

      <Flex gap="3" align="center" minW="0" w="full">
        <Flex
          align="center"
          gap="2.5"
          minW="0"
          flex="1"
          h="11"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          px="3.5"
          color="fg.muted"
        >
          <Search size={17} />
          <chakra.input
            aria-label="Search conversations"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Search conversations..."
            minW="0"
            w="full"
            bg="transparent"
            color="fg"
            fontSize="sm"
            outline="none"
            _placeholder={{ color: 'fg.muted' }}
          />
        </Flex>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label={activeFilterCount > 0 ? `Filter conversations, ${activeFilterCount} active` : 'Filter conversations'}
              title="Filter conversations"
              position="relative"
              colorPalette={activeFilterCount > 0 ? 'teal' : undefined}
              style={{ height: '2.75rem', width: '2.75rem', borderRadius: '0.75rem', padding: '0' }}
            >
              <SlidersHorizontal size={17} />
              {activeFilterCount > 0 ? (
                <Flex
                  position="absolute"
                  top="-1"
                  right="-1"
                  boxSize="5"
                  align="center"
                  justify="center"
                  rounded="full"
                  bg="teal.solid"
                  color="fg.inverted"
                  fontSize="2xs"
                  fontWeight="semibold"
                  lineHeight="1"
                >
                  {activeFilterCount}
                </Flex>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent minW="15rem">
            <Box px="3" py="2">
              <Text fontSize="xs" fontWeight="semibold" color="fg.muted">Context</Text>
            </Box>
            <DropdownMenuRadioGroup
              value={`context:${contextFilter}`}
              onValueChange={(value) => setContextFilter(value.replace('context:', '') as ConversationContextFilter)}
            >
              {contextFilterOptions.map(option => (
                <DropdownMenuRadioItem key={option.value} value={`context:${option.value}`}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <Box mx="2" my="1.5" h="1px" bg="border.surface" />
            <Box px="3" py="2">
              <Text fontSize="xs" fontWeight="semibold" color="fg.muted">Time</Text>
            </Box>
            <DropdownMenuRadioGroup
              value={`time:${timeFilter}`}
              onValueChange={(value) => setTimeFilter(value.replace('time:', '') as ConversationTimeFilter)}
            >
              {timeFilterOptions.map(option => (
                <DropdownMenuRadioItem key={option.value} value={`time:${option.value}`}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {activeFilterCount > 0 ? (
              <>
                <Box mx="2" my="1.5" h="1px" bg="border.surface" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  w="full"
                  justifyContent="flex-start"
                  onClick={() => {
                    setContextFilter('all');
                    setTimeFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </Flex>

      <Box
        minH="0"
        minW="0"
        w="full"
        maxW="full"
        flex="1"
        overflowY="auto"
        overflowX="hidden"
        px="0"
        mt={showHeader ? '7' : '4'}
      >
        {conversationsQuery.isLoading ? (
          <Flex align="center" gap="2" py="4" fontSize="sm" color="fg.muted">
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Loading chats
          </Flex>
        ) : filteredConversationSections.length === 0 ? (
          <Text py="4" fontSize="sm" color="fg.muted">
            {searchQuery.trim().length > 0 || activeFilterCount > 0
              ? 'No conversations match your filters.'
              : 'No conversations yet.'}
          </Text>
        ) : (
          <Flex direction="column" gap="6" minW="0" w="full" maxW="full">
            {filteredConversationSections.map(([sectionLabel, conversations]) => (
              <Flex key={sectionLabel} direction="column" gap="3" minW="0" w="full" maxW="full">
                <Text fontSize="sm" fontWeight="medium" color="fg.muted">{sectionLabel}</Text>
                <Flex direction="column" gap="2.5" minW="0" w="full" maxW="full">
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
                            rounded="xl"
                            px="4"
                            py="3.5"
                            pr={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? '12' : '10'}
                            textAlign="left"
                            fontSize="sm"
                            bg={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? 'teal.subtle' : 'transparent'}
                            color="fg"
                            borderWidth="1px"
                            borderColor={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? 'teal.muted' : 'transparent'}
                            boxShadow={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? 'xs' : 'none'}
                            cursor="pointer"
                            _hover={selectedChatId !== conversation.id && effectiveSelectedChatId !== conversation.id ? { bg: 'bg.subtle' } : undefined}
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
                              fontWeight="semibold"
                            >
                              {conversation.title}
                            </Text>
                            <Text mt="1.5" fontSize="sm" color="fg.muted">
                              {formatDate(conversation.updatedAt)}
                            </Text>
                          </chakra.button>
                        </TooltipTrigger>
                        <TooltipContent>{conversation.title}</TooltipContent>
                      </Tooltip>
                      {selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? (
                        <Flex
                          position="absolute"
                          right="3"
                          top="50%"
                          transform="translateY(-50%)"
                          pointerEvents="none"
                          color="teal.fg"
                        >
                          <CheckCircle2 size={18} />
                        </Flex>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${conversation.title}`}
                        position="absolute"
                        right={selectedChatId === conversation.id || effectiveSelectedChatId === conversation.id ? '8' : '2'}
                        top="50%"
                        transform="translateY(-50%)"
                        opacity="0"
                        _groupHover={{ opacity: '1' }}
                        style={{ height: '1.5rem', width: '1.5rem', borderRadius: '9999px', flexShrink: 0 }}
                        onClick={() => onDeleteConversation(conversation.id)}
                      >
                        <Trash2 size={12} />
                      </Button>
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
