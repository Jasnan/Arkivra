import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, ScrollArea, Skeleton, Status } from '@chakra-ui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { VirtualItem } from '@tanstack/react-virtual';
import { ArrowDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatApiScope } from '../chat.api';
import type { ChatStreamStatus } from '../chat.types';
import type { ChatMetricsByMessageId, LocalMessage } from './chat-utils';
import { statusLabel } from './chat-utils';
import { MarkdownMessage } from './markdown-message';
import { MessageBubble } from './message-bubble';

const SCROLL_FOLLOW_THRESHOLD = 96;
const TIMELINE_OVERSCAN = 6;
const TIMELINE_INITIAL_HEIGHT = 720;
const TIMELINE_INITIAL_WIDTH = 1024;
const FALLBACK_RENDER_LIMIT = 24;

type TimelineItem =
  | {
      key: string;
      type: 'message';
      message: LocalMessage;
    }
  | {
      key: string;
      type: 'streaming';
    };

export function VirtualChatTimeline({
  conversationId,
  messages,
  currentVaultId,
  scope,
  activeStatus,
  metricsByMessageId,
  streamingText,
  isStreaming,
  onQuickReplySelect,
}: {
  conversationId: string;
  messages: LocalMessage[];
  currentVaultId?: string;
  scope: ChatApiScope;
  activeStatus: ChatStreamStatus | null;
  metricsByMessageId: ChatMetricsByMessageId;
  streamingText: string;
  isStreaming: boolean;
  onQuickReplySelect?: (reply: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const shouldRenderStreamingRow = streamingText.length > 0 || isStreaming;
  const items = useMemo<TimelineItem[]>(
    () => [
      ...messages.map((message) => ({
        key: message.id,
        type: 'message' as const,
        message,
      })),
      ...(shouldRenderStreamingRow ? [{ key: '__streaming_response__', type: 'streaming' as const }] : []),
    ],
    [messages, shouldRenderStreamingRow],
  );
  const lastItemKey = items.at(-1)?.key ?? '';

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    getItemKey: (index) => items[index]?.key ?? index,
    estimateSize: (index) => estimateTimelineItemSize(items[index]),
    overscan: TIMELINE_OVERSCAN,
    initialRect: {
      height: TIMELINE_INITIAL_HEIGHT,
      width: TIMELINE_INITIAL_WIDTH,
    },
  });

  const setBottomState = useCallback((nextIsAtBottom: boolean) => {
    isAtBottomRef.current = nextIsAtBottom;
    setIsAtBottom((current) => (current === nextIsAtBottom ? current : nextIsAtBottom));
  }, []);

  const updateBottomState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setBottomState(distanceToBottom <= SCROLL_FOLLOW_THRESHOLD);
  }, [setBottomState]);

  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollElement(node);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (items.length === 0) return;
    virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior });
    setBottomState(true);
  }, [items.length, setBottomState, virtualizer]);

  const previousConversationIdRef = useRef(conversationId);
  const previousLastItemKeyRef = useRef(lastItemKey);

  useLayoutEffect(() => {
    if (items.length === 0) return undefined;

    const conversationChanged = previousConversationIdRef.current !== conversationId;
    const lastItemChanged = previousLastItemKeyRef.current !== lastItemKey;
    previousConversationIdRef.current = conversationId;
    previousLastItemKeyRef.current = lastItemKey;

    if (!conversationChanged && !lastItemChanged && !isAtBottomRef.current) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToBottom();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationId, items.length, lastItemKey, scrollToBottom, streamingText]);

  const virtualItems = virtualizer.getVirtualItems();
  const renderedVirtualItems = virtualItems.length > 0
    ? virtualItems
    : getFallbackVirtualItems(items);
  const measuredContentHeight = virtualizer.getTotalSize();
  const viewportHeight = virtualizer.scrollRect?.height ?? 0;
  const bottomOffset = Math.max(0, viewportHeight - measuredContentHeight);
  const timelineHeight = Math.max(measuredContentHeight, viewportHeight);

  return (
    <ScrollArea.Root h="full" minH="0" minW="0" size="xs" variant="hover" position="relative">
      <ScrollArea.Viewport ref={setScrollRef} h="full" onScroll={updateBottomState}>
        <ScrollArea.Content minH="full">
          <Box
            role="log"
            aria-label="Conversation timeline"
            aria-live="polite"
            aria-relevant="additions text"
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
            <Box position="relative" h={`${timelineHeight}px`} minH="full" w="100%">
              {renderedVirtualItems.map((virtualItem) => {
                const item = items[virtualItem.index];
                if (!item) return null;

                return (
                  <Box
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    position="absolute"
                    top="0"
                    left="0"
                    w="100%"
                    pb="4"
                    transform={`translateY(${bottomOffset + virtualItem.start}px)`}
                  >
                    <TimelineRow
                      item={item}
                      currentVaultId={currentVaultId}
                      scope={scope}
                      activeStatus={activeStatus}
                      metricsByMessageId={metricsByMessageId}
                      streamingText={streamingText}
                      onQuickReplySelect={onQuickReplySelect}
                    />
                  </Box>
                );
              })}
            </Box>
          </Box>
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar bg="transparent">
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>

      {!isAtBottom ? (
        <Box position="absolute" right={{ base: '4', md: '6' }} bottom="5" zIndex="1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="solid"
                colorPalette="teal"
                size="icon"
                aria-label="Scroll to latest message"
                shadow="lg"
                style={{ height: '2.25rem', width: '2.25rem', borderRadius: '9999px' }}
                onClick={() => scrollToBottom('smooth')}
              >
                <ArrowDown size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Latest message</TooltipContent>
          </Tooltip>
        </Box>
      ) : null}
    </ScrollArea.Root>
  );
}

function TimelineRow({
  item,
  currentVaultId,
  scope,
  activeStatus,
  metricsByMessageId,
  streamingText,
  onQuickReplySelect,
}: {
  item: TimelineItem;
  currentVaultId?: string;
  scope: ChatApiScope;
  activeStatus: ChatStreamStatus | null;
  metricsByMessageId: ChatMetricsByMessageId;
  streamingText: string;
  onQuickReplySelect?: (reply: string) => void;
}) {
  if (item.type === 'streaming') {
    return (
      <Flex gap="4">
        <Flex
          mt="0"
          boxSize="11"
          shrink="0"
          align="center"
          justify="center"
          rounded="full"
          bg="teal.solid"
          color="fg.inverted"
          shadow="sm"
        >
          <Sparkles size={18} />
        </Flex>
        <Box w="100%" maxW="min(56rem, calc(100% - 3.75rem))">
          <Box
            rounded="xl"
            bg="bg.surface"
            px={{ base: '5', md: '7' }}
            py={{ base: '4', md: '5' }}
            fontSize="sm"
            lineHeight="1.75"
            color="fg"
            borderWidth="1px"
            borderColor="border.surface"
            shadow="sm"
          >
            {streamingText.length > 0 ? (
              <MarkdownMessage content={streamingText} citations={[]} />
            ) : (
              <StreamingAnswerSkeleton label={statusLabel(activeStatus, scope)} />
            )}
          </Box>
        </Box>
      </Flex>
    );
  }

  return (
    <MessageBubble
      message={item.message}
      currentVaultId={currentVaultId}
      scope={scope}
      activeStatus={activeStatus}
      metrics={metricsByMessageId[item.message.id] ?? item.message.generationMetrics ?? undefined}
      onQuickReplySelect={onQuickReplySelect}
    />
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

function estimateTimelineItemSize(item: TimelineItem | undefined) {
  if (!item) return 160;
  if (item.type === 'streaming') return 160;
  return item.message.role === 'user' ? 112 : 220;
}

function getFallbackVirtualItems(items: TimelineItem[]): VirtualItem[] {
  const startIndex = Math.max(0, items.length - FALLBACK_RENDER_LIMIT);
  let start = items
    .slice(0, startIndex)
    .reduce((total, item) => total + estimateTimelineItemSize(item), 0);

  return items.slice(startIndex).map((item, offset) => {
    const index = startIndex + offset;
    const size = estimateTimelineItemSize(item);
    const virtualItem = {
      index,
      key: item.key,
      start,
      size,
      end: start + size,
      lane: 0,
    };
    start += size;
    return virtualItem;
  });
}
